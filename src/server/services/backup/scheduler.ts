import path from 'path';
import fs from 'fs';
import { logger } from '../logging/config.js';
import { getConfig } from '../../config/index.js';
import { runBackupOnce } from './backupService.js';

/**
 * 自动备份调度(IP-08a/S02)——旧实现只有一行日志。
 *
 * 读取 config.database.backupEnabled / backupInterval / backupRetentionDays,
 * 按间隔执行 runBackupOnce(在线一致性备份+校验+保留),失败记录错误并继续
 * 下个周期(不吞异常——可见于日志与 lastResult)。
 */

export interface SchedulerState {
  lastResult: { ok: boolean; at: string; file?: string; error?: string } | null;
  timer: ReturnType<typeof setInterval> | null;
}

export const schedulerState: SchedulerState = { lastResult: null, timer: null };

/** interval 配置 → 毫秒(supports 'daily' | 'weekly' | 'hourly' | 小时数字符串) */
export function parseIntervalMinutes(interval: string): number | null {
  const s = String(interval).trim().toLowerCase();
  if (s === 'hourly') return 60;
  if (s === 'daily') return 60 * 24;
  if (s === 'weekly') return 60 * 24 * 7;
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return n; // 分钟数
  return null;
}

function backupDirFor(dbFilePath: string): string {
  return path.join(path.dirname(dbFilePath), 'backups');
}

/** 执行一次备份并记录状态(测试与调度共用) */
export function backupAndRecord(dbFilePath: string, retentionDays: number): SchedulerState['lastResult'] {
  try {
    const { result } = runBackupOnce({
      dbFilePath,
      backupDir: backupDirFor(dbFilePath),
      retention: retentionDays
    });
    const entry = { ok: true, at: result.createdAt, file: result.file };
    schedulerState.lastResult = entry;
    logger.info(`Automatic backup completed: ${result.file} (${result.sizeBytes} bytes)`);
    return entry;
  } catch (e) {
    const entry = { ok: false, at: new Date().toISOString(), error: (e as Error).message };
    schedulerState.lastResult = entry;
    logger.error(`Automatic backup failed: ${entry.error}`);
    return entry;
  }
}

export function initializeAutomaticBackups(opts?: {
  dbFilePath?: string;
  timerApi?: { setInterval: typeof setInterval; clearInterval: typeof clearInterval };
  runNow?: boolean;
}): void {
  const dbConfig = getConfig().database;
  if (!dbConfig.backupEnabled) {
    logger.info('Automatic backups disabled (DB_BACKUP_ENABLED=false)');
    return;
  }
  const minutes = parseIntervalMinutes(dbConfig.backupInterval);
  if (minutes == null) {
    logger.error(`Automatic backups disabled: unknown interval '${dbConfig.backupInterval}'`);
    return;
  }
  const dbFilePath = opts?.dbFilePath ?? dbConfig.filename;
  const timerApi = opts?.timerApi ?? { setInterval, clearInterval };

  if (schedulerState.timer) timerApi.clearInterval(schedulerState.timer);

  const run = () => backupAndRecord(dbFilePath, dbConfig.backupRetentionDays);
  if (opts?.runNow !== false) {
    // 启动即执行第一次,其后按周期
    setImmediate(run);
  }
  schedulerState.timer = timerApi.setInterval(run, minutes * 60 * 1000);
  logger.info(`Automatic backup scheduler initialized: interval=${minutes}min retention=${dbConfig.backupRetentionDays} dir=${backupDirFor(dbFilePath)}`);
  void fs; // path/fs 由 backupService 使用,此处保留 import 以备扩展
}

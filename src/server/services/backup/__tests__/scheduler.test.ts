// Mock the logger
jest.mock('../../logging/config.js', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    http: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock config with controllable database settings
const mockDbConfig = {
  backupEnabled: true,
  backupInterval: 'daily',
  backupRetentionDays: 30,
  filename: '/tmp/scheduler-test.db'
};
jest.mock('../../../config/index.js', () => ({
  config: { database: mockDbConfig },
  getConfig: () => ({ database: mockDbConfig })
}));

// Mock backupService.runBackupOnce(避免真实文件 IO;记录调用)
const runBackupOnce = jest.fn();
jest.mock('../backupService.js', () => ({
  runBackupOnce: (...args: unknown[]) => runBackupOnce(...args)
}));

import { initializeAutomaticBackups, parseIntervalMinutes, schedulerState, backupAndRecord } from '../scheduler.js';
import { logger } from '../../logging/config.js';

describe('backup scheduler (IP-08a)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(globalThis, 'setImmediate').mockImplementation(((cb: () => void) => { cb(); return 0; }) as unknown as typeof setImmediate);
    schedulerState.timer = null;
    schedulerState.lastResult = null;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('初始即执行一次备份并按周期注册定时器', () => {
    runBackupOnce.mockReturnValue({ result: { file: '/tmp/x.db', sizeBytes: 10, createdAt: '2026-10-16T00:00:00Z' }, verify: {}, removed: [] });
    const setIntervalMock = jest.fn().mockReturnValue(42) as unknown as typeof setInterval;
    const clearIntervalMock = jest.fn() as unknown as typeof clearInterval;

    initializeAutomaticBackups({ timerApi: { setInterval: setIntervalMock, clearInterval: clearIntervalMock } });

    expect(runBackupOnce).toHaveBeenCalledTimes(1); // 启动即执行
    expect(setIntervalMock).toHaveBeenCalledWith(expect.any(Function), 60 * 24 * 60 * 1000); // daily
    expect(schedulerState.lastResult).toMatchObject({ ok: true, file: '/tmp/x.db' });
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('interval=1440min'));
  });

  it('backupEnabled=false 时不注册定时器', () => {
    mockDbConfig.backupEnabled = false;
    try {
      const setIntervalMock = jest.fn() as unknown as typeof setInterval;
      initializeAutomaticBackups({ timerApi: { setInterval: setIntervalMock, clearInterval: jest.fn() } });
      expect(setIntervalMock).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('disabled'));
    } finally {
      mockDbConfig.backupEnabled = true;
    }
  });

  it('未知 interval 配置:报错且不注册', () => {
    mockDbConfig.backupInterval = 'sometimes';
    try {
      const setIntervalMock = jest.fn() as unknown as typeof setInterval;
      initializeAutomaticBackups({ timerApi: { setInterval: setIntervalMock, clearInterval: jest.fn() } });
      expect(setIntervalMock).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("unknown interval 'sometimes'"));
    } finally {
      mockDbConfig.backupInterval = 'daily';
    }
  });

  it('备份失败可见:记入 lastResult 与错误日志,不抛出', () => {
    runBackupOnce.mockImplementation(() => { throw new Error('disk full'); });
    const entry = backupAndRecord('/tmp/scheduler-test.db', 30);
    expect(entry).toMatchObject({ ok: false, error: 'disk full' });
    expect(schedulerState.lastResult).toMatchObject({ ok: false });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('disk full'));
  });

  it('parseIntervalMinutes 覆盖 hourly/daily/weekly/数字分钟', () => {
    expect(parseIntervalMinutes('hourly')).toBe(60);
    expect(parseIntervalMinutes('daily')).toBe(1440);
    expect(parseIntervalMinutes('weekly')).toBe(10080);
    expect(parseIntervalMinutes('90')).toBe(90);
    expect(parseIntervalMinutes('nonsense')).toBeNull();
  });

  it('重复初始化清理旧定时器(不叠加)', () => {
    runBackupOnce.mockReturnValue({ result: { file: '/tmp/x.db', sizeBytes: 1, createdAt: 't' }, verify: {}, removed: [] });
    const setIntervalMock = jest.fn().mockReturnValue(1) as unknown as typeof setInterval;
    const clearIntervalMock = jest.fn() as unknown as typeof clearInterval;
    const api = { setInterval: setIntervalMock, clearInterval: clearIntervalMock };

    initializeAutomaticBackups({ timerApi: api });
    initializeAutomaticBackups({ timerApi: api });

    expect(clearIntervalMock).toHaveBeenCalledWith(1); // 第二次初始化清理第一个定时器
  });
});

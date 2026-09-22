import { Router } from 'express';
import { quarterOf, monthsOf, intensityPct } from '../../services/iteration/IterationStats.js';
import { BaseController, RequestWithContext } from './BaseController.js';

type RequestWithLogging = RequestWithContext;

/**
 * 迭代域控制器(设计 §3/§9, BOARD_REDESIGN_2026-09-23)。
 *
 * 迭代 = 执行窗口的唯一日期真相;季度由 start_date 派生(年份.RP+季度,工作月
 * 口径与人月推导见设计 §0.3)。装载统计供迭代页 v1: 事项数/SE·MDE·开发人月/
 * 状态分布/按人汇总(MDE 防爆表 = 人月÷迭代时长>100% 琥珀,§0.5)。
 */
export class IterationsController extends BaseController {
  /** start_date → "26.RP4" 式季度标签(派生,不落库) */
  private quarterOf(startDate: string): string {
    const d = new Date(startDate + 'T00:00:00');
    const year = String(d.getFullYear()).slice(2);
    const q = Math.floor(d.getMonth() / 3) + 1;
    return `${year}.RP${q}`;
  }

  private workdaysBetween(start: string, end: string): number {
    const a = new Date(start + 'T00:00:00');
    const b = new Date(end + 'T00:00:00');
    let days = 0;
    for (let t = a; t <= b; t.setDate(t.getDate() + 1)) {
      const dow = t.getDay();
      if (dow !== 0 && dow !== 6) days++;
    }
    return Math.max(days, 1);
  }

  getAll = this.asyncHandler(async (req: RequestWithLogging, res: any) => {
    const iterations = await this.db('iterations').orderBy('start_date', 'desc').select();

    // 挂接事项(含生命周期状态,全场景事实字段)
    const items = await this.db('projects')
      .whereNotNull('iteration_id')
      .whereNotNull('lifecycle_state')
      .select('id', 'name', 'iteration_id', 'lifecycle_state', 'priority', 'parent_id');

    // 最新评估(开发人月)与最新设计粗估分量(se/mde 人月)
    const estRows = await this.db('project_estimations').orderBy('created_at').orderBy('id')
      .select('project_id', 'estimated_loc', 'loc_rate_per_pm');
    const devPm = new Map<string, number>();
    for (const r of estRows) {
      const loc = Number(r.estimated_loc);
      if (Number.isFinite(loc)) devPm.set(r.project_id, Math.round((loc / (Number(r.loc_rate_per_pm) || 500)) * 100) / 100);
    }
    const deRows = await this.db('project_design_estimations').orderBy('created_at').orderBy('id')
      .select('project_id', 'se_estimate_pm', 'mde_estimate_pm');
    const designEst = new Map<string, { se: number | null; mde: number | null }>();
    for (const r of deRows) designEst.set(r.project_id, { se: r.se_estimate_pm, mde: r.mde_estimate_pm });

    // SE/MDE 分配(按人): 人月取该人分配事项的分量粗估,项数=分配数
    const roleRows = await this.db('assignments_view as av')
      .join('roles as r', 'av.role_id', 'r.id')
      .join('people as pe', 'av.person_id', 'pe.id')
      .whereIn('av.status', ['active'])
      .whereIn('r.name', ['SE', 'MDE'])
      .select('av.project_id', 'r.name as role_name', 'pe.name as person_name', 'av.allocation_percentage');

    const data = iterations.map((it: any) => {
      const mine = items.filter((p: any) => p.iteration_id === it.id);
      const round2 = (n: number) => Math.round(n * 100) / 100;
      let sePm = 0, mdePm = 0, devPmSum = 0;
      for (const p of mine) {
        const de = designEst.get(p.id);
        if (de) { sePm += Number(de.se ?? 0); mdePm += Number(de.mde ?? 0); }
        devPmSum += devPm.get(p.id) ?? 0;
      }
      const stateDist = new Map<string, number>();
      for (const p of mine) stateDist.set(p.lifecycle_state, (stateDist.get(p.lifecycle_state) ?? 0) + 1);

      // 按人汇总(SE/MDE): 人月=其分配事项的分量和;强度%=人月÷迭代时长(月)
      const months = monthsOf(it.start_date, it.end_date);
      const byRolePerson = new Map<string, { role: string; person: string; items: number; pm: number }>();
      for (const r of roleRows) {
        if (!mine.some((p: any) => p.id === r.project_id)) continue;
        const key = `${r.role_name}::${r.person_name}`;
        if (!byRolePerson.has(key)) byRolePerson.set(key, { role: r.role_name, person: r.person_name, items: 0, pm: 0 });
        const rec = byRolePerson.get(key)!;
        rec.items += 1;
        const de = designEst.get(r.project_id);
        rec.pm += Number((r.role_name === 'SE' ? de?.se : de?.mde) ?? 0);
      }
      const load = [...byRolePerson.values()].map((r) => ({
        ...r, pm: round2(r.pm),
        intensity_pct: intensityPct(r.pm, it.start_date, it.end_date)
      }));

      return {
        ...it,
        quarter: quarterOf(it.start_date),
        stats: {
          item_count: mine.length,
          se_pm: round2(sePm),
          mde_pm: round2(mdePm),
          dev_pm: round2(devPmSum),
          months,
          states: [...stateDist.entries()].map(([state, count]) => ({ state, count })),
          load
        }
      };
    });

    res.json({ data });
  });

  create = this.asyncHandler(async (req: RequestWithLogging, res: any) => {
    const { name, start_date, end_date } = req.body ?? {};
    if (!name?.trim() || !start_date || !end_date) {
      res.status(400).json({ error: 'Validation error', message: 'name/start_date/end_date 必填' });
      return;
    }
    if (new Date(end_date) < new Date(start_date)) {
      res.status(400).json({ error: 'Validation error', message: 'end_date 不得早于 start_date' });
      return;
    }
    const allNames = await this.db('iterations').select('name');
    const dup = allNames.find((r: any) => String(r.name).toLowerCase() === name.trim().toLowerCase());
    if (dup) {
      res.status(409).json({ error: 'Conflict', message: '同名迭代已存在', data: dup });
      return;
    }
    const id = `iter-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await this.db('iterations').insert({ id, name: name.trim(), start_date, end_date });
    const row = await this.db('iterations').where({ id }).first();
    res.status(201).json({ success: true, data: row });
  });

  update = this.asyncHandler(async (req: RequestWithLogging, res: any) => {
    const { id } = req.params;
    const { name, start_date, end_date } = req.body ?? {};
    const existing = await this.db('iterations').where({ id }).first();
    if (!existing) { res.status(404).json({ error: 'Not Found', message: '迭代不存在' }); return; }
    if (start_date && end_date && new Date(end_date) < new Date(start_date)) {
      res.status(400).json({ error: 'Validation error', message: 'end_date 不得早于 start_date' });
      return;
    }
    await this.db('iterations').where({ id }).update({
      ...(name?.trim() ? { name: name.trim() } : {}),
      ...(start_date ? { start_date } : {}),
      ...(end_date ? { end_date } : {}),
      updated_at: new Date()
    });
    res.json({ success: true, data: await this.db('iterations').where({ id }).first() });
  });

  remove = this.asyncHandler(async (req: RequestWithLogging, res: any) => {
    const { id } = req.params;
    const attached = await this.db('projects').where({ iteration_id: id }).count('* as n').first();
    if (Number(attached?.n ?? 0) > 0) {
      res.status(400).json({
        error: 'Validation error',
        message: `仍有 ${attached.n} 个事项挂靠该迭代,请先转移再删除`
      });
      return;
    }
    const deleted = await this.db('iterations').where({ id }).del();
    if (!deleted) { res.status(404).json({ error: 'Not Found', message: '迭代不存在' }); return; }
    res.json({ success: true });
  });
}

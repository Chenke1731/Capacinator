import { useTranslation } from 'react-i18next';

/**
 * 看板新格件(BOARD_REDESIGN_2026-09-23,实施日志 D2):
 * 评估链三格(代码规模 KLOC / 人力·评估人月 / SE·MDE 人+粗估)与
 * 实名投入格。B3a 阶段为白板化只读;交互(弹层/就地编辑)在 B3c-B3e 逐步点亮。
 *
 * 排版契约: 值=12.5 mono/主色 或 姓名+值; 注记=11/次色; SR 行由页面侧
 * 传入聚合值(只读,设计 §1)。
 */

/** 代码规模: 最新评估换算 KLOC,只读(评估在详情页) */
export function KlocCell({ kloc }: { kloc: number | null }) {
  const { t } = useTranslation();
  if (kloc == null) return <span className="req-kloc req-kloc--empty">{t('projects:scale.empty')}</span>;
  return (
    <span className="req-kloc" title={t('projects:scale.tooltip')}>
      <span className="req-kloc-num">{kloc}K</span>
    </span>
  );
}

/** 人力: 评估开发人月(设计 §0.3——人月给事,开发侧总量) */
export function EffortCell({ pm }: { pm: number | null }) {
  const { t } = useTranslation();
  return (
    <span className="req-effort" title={t('projects:effort.tooltip')}>
      {pm != null ? <span className="req-effort-num">{pm}</span> : <span className="text-muted">—</span>}
    </span>
  );
}

/** SE/MDE 格: `王工 0.5`(人 primary + 粗估人月 mono 次色,设计 §5)。
    B3a 白板只读;B3d 点亮弹层(推导式/负载警示/占用%)。 */
export function RoleCell({
  roleName, person, pm, title
}: { roleName: string; person: { person_name: string; allocation_pct: number } | null; pm: number | null; title?: string }) {
  return (
    <span className={`req-role req-role--${roleName}`} title={title ?? `${roleName} 投入`}>
      {person ? (
        <>
          <span className="req-role-person">{person.person_name}</span>
          {pm != null && <span className="req-role-pm">{pm}</span>}
        </>
      ) : (
        <span className="text-muted">—</span>
      )}
    </span>
  );
}

/** 实名投入: 主投入开发 + 投入窗口(设计 §4);B3e 点亮弹层 */
export function PrimaryDevCell({
  primary
}: { primary: { person_name: string; start_date: string | null; end_date: string | null } | null }) {
  const { t } = useTranslation();
  const fmt = (d: string | null) => (d ? String(d).slice(5) : '');
  return (
    <span className="req-primary" title={t('projects:primaryDev.hint')}>
      {primary ? (
        <>
          <span className="req-primary-person">{primary.person_name}</span>
          {primary.start_date && (
            <span className="req-primary-window">
              {fmt(primary.start_date)}{primary.end_date ? `~${fmt(primary.end_date)}` : '~'}
            </span>
          )}
        </>
      ) : (
        <span className="text-muted">{t('projects:primaryDev.none')}</span>
      )}
    </span>
  );
}

/**
 * CapacityHeatStrip（工作台 v2 §5.2/§6.2/§9）——容量热区的唯一渲染件。
 * 弹窗迷你热区与泳道热区共用；数据一律来自 workloadTimeline buckets
 * （相对利用率轴），组件不做任何容量计算。
 *
 * 可访问性（§15）：超载不只靠红色——条上有 ▲ 图标 + sr-only 文本清单；
 * 热区整体 role=img + aria-label 摘要。
 */
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import type { WorkloadTimelineBucket } from '../../lib/workloadTimeline';

interface CapacityHeatStripProps {
  buckets: WorkloadTimelineBucket[];
  /** 纵轴上限（相对利用率 %），默认 200 */
  axisMax?: number;
  compact?: boolean;
  'data-testid'?: string;
}

function labelForBucket(bucket: WorkloadTimelineBucket, compact: boolean): string {
  // week/day: MM-DD；month: YYYY-MM
  if (bucket.key.includes('-') && bucket.key.length === 7) return bucket.key.slice(2);
  if (compact) return bucket.start.slice(5);
  return `${bucket.start.slice(5)}~${bucket.end.slice(5)}`;
}

export function CapacityHeatStrip({ buckets, axisMax = 200, compact = false, 'data-testid': testId }: CapacityHeatStripProps) {
  const { t } = useTranslation(['assignments']);

  if (buckets.length === 0) {
    return <div className="pw-heat pw-heat--empty">{t('assignments:workbench.heat.noData')}</div>;
  }

  const overBuckets = buckets.filter((bucket) => bucket.overloaded);
  const peak = buckets.reduce<number>((max, bucket) => Math.max(max, bucket.relativeUtilization ?? 0), 0);
  const unknownOnly = buckets.every((bucket) => bucket.relativeUtilization === null);

  const summary = unknownOnly
    ? t('assignments:workbench.heat.summaryUnknown')
    : t('assignments:workbench.heat.summary', {
        peak: Math.round(peak),
        overloaded: overBuckets.length,
      });

  return (
    <div
      className={`pw-heat${compact ? ' pw-heat--compact' : ''}`}
      role="img"
      aria-label={summary}
      data-testid={testId}
    >
      <div className="pw-heat-bars" aria-hidden="true">
        {buckets.map((bucket) => {
          const relative = bucket.relativeUtilization;
          const height =
            relative === null
              ? 4
              : relative <= 0
                ? 0
                : Math.max(4, (Math.min(relative, axisMax) / axisMax) * 100);
          const title =
            relative === null
              ? `${labelForBucket(bucket, compact)} · ${t('assignments:workbench.heat.unknown')}`
              : `${labelForBucket(bucket, compact)} · ${Math.round(relative)}%${
                  bucket.overloaded ? ` · ${t('assignments:workbench.heat.overload')}` : ''
                }`;
          return (
            <div
              key={bucket.key}
              className={`pw-heat-bar${bucket.overloaded ? ' pw-heat-bar--over' : ''}${relative === null ? ' pw-heat-bar--unknown' : ''}`}
              style={{ height: `${height}%` }}
              title={title}
            />
          );
        })}
      </div>
      {/* DV-1（一图一 Y 轴）：泳道热区已由外层 pw-gantt-heat-scale 提供刻度，
          组件内不再渲染第二套轴——同屏双刻度伪造相关性（I03g 修复现行违规） */}
      <ul className="sr-only">
        {overBuckets.map((bucket) => (
          <li key={bucket.key}>
            {`${labelForBucket(bucket, compact)} ${Math.round(bucket.relativeUtilization ?? 0)}% ${t('assignments:workbench.heat.overload')}`}
          </li>
        ))}
      </ul>
      {overBuckets.length > 0 ? (
        <span className="pw-heat-overload-note">
          <AlertTriangle size={13} aria-hidden="true" />
          {t('assignments:workbench.heat.overloadCount', { count: overBuckets.length })}
        </span>
      ) : null}
    </div>
  );
}

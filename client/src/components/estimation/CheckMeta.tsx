import { useTranslation } from 'react-i18next';
import { getLocale } from '../../i18n';

/**
 * R08 收尾(2026-10-18): 校验结果的场景与计算时点标注。
 * 值冻结在校验时刻(面板 mutation 捕获进 checkContext 快照)——之后切场景
 * 或流逝时间都不会让旧结果的标注漂移;与版本标识/过期徽标同位呈现。
 */
export function CheckMeta({ scenarioName, checkedAt }: { scenarioName?: string; checkedAt?: string }) {
  const { t } = useTranslation();
  if (!scenarioName && !checkedAt) return null;
  return (
    <span className="text-muted estimation-check-meta">
      {t('projects:estimation.checkScenarioAt', {
        scenario: scenarioName || '—',
        time: checkedAt ? new Date(checkedAt).toLocaleString(getLocale()) : '—'
      })}
    </span>
  );
}

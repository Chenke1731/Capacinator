import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Info } from 'lucide-react';
import { api } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';
import type { DemandIntake, IntakeConvertResult } from '../../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert, AlertDescription } from '../ui/alert';
import { Spinner } from '../ui/spinner';

/**
 * IntakeTriageDialog —— 收件箱分流（I01 设计稿 §5.4）。
 *
 * 收敛决策（2026-11-10）：类型/子类型合成**一个**"类型（子类型）"选择器
 * （选定子类型即派生父类型，少一次点击）；无 create_baseline 开关——
 * 有期望开始日即生成基线，无则不生成并明示"未定基线"（不阻塞）。
 * 子类型选择记住上次（localStorage）；转换成功由父级收尾（toast+链接）。
 */
const SUBTYPE_STORAGE = 'intake-triage-subtype';

interface IntakeTriageDialogProps {
  open: boolean;
  intake: DemandIntake | null;
  onClose: () => void;
  onConverted: (result: IntakeConvertResult) => void;
}

interface SubTypeGroup {
  project_type_id: string;
  project_type_name?: string;
  sub_types: { id: string; name: string; is_active?: number | boolean }[];
}

export function IntakeTriageDialog({ open, intake, onClose, onConverted }: IntakeTriageDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [subTypeId, setSubTypeId] = useState('');
  const [priority, setPriority] = useState(3);
  const [ownerId, setOwnerId] = useState('');
  const [expectedStart, setExpectedStart] = useState('');
  const [expectedFinish, setExpectedFinish] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: groups } = useQuery({
    queryKey: ['project-sub-types'],
    queryFn: async () => {
      const response = await api.projectSubTypes.list();
      return (response.data as any).data || [];
    },
    enabled: open,
  });
  const subTypeGroups: SubTypeGroup[] = Array.isArray(groups) ? groups : [];

  const { data: people } = useQuery({
    queryKey: ['people-active-intake'],
    queryFn: async () => {
      const response = await api.people.list({ is_active: 'true', limit: 500 });
      const payload = response.data as any;
      return Array.isArray(payload) ? payload : payload?.data || [];
    },
    enabled: open,
  });
  const activePeople: { id: string; name: string }[] = Array.isArray(people) ? people : [];

  // 打开时按 intake 初始化 + 记住的子类型
  useEffect(() => {
    if (open && intake) {
      setTitle(intake.title);
      setPriority(intake.priority_hint ?? 3);
      setOwnerId('');
      // D14（2026-11-10 裁决 a）：行已有期望开始日则预填。弹窗陈述必须与服务端
      // 行为一致——IntakeConversionService 用 inStart ?? intake.expected_start 回落，
      // 空 start 提交后服务端仍按行值建基线；旧版硬编码空导致 UI 承诺
      // "不生成阶段"而实际生成（G-01 / triage-start-divergence）。
      setExpectedStart(intake.expected_start ?? '');
      setExpectedFinish(intake.expected_finish ?? '');
      setError(null);
      const remembered = localStorage.getItem(SUBTYPE_STORAGE) ?? '';
      const exists = subTypeGroups.some((g) =>
        g.sub_types.some((s) => s.id === remembered && s.is_active !== false)
      );
      setSubTypeId(exists ? remembered : '');
    }
    // subTypeGroups 首次加载晚于 open——依赖它以回填记住值
  }, [open, intake, subTypeGroups]);

  const flatSubTypes = useMemo(
    () =>
      subTypeGroups.flatMap((g) =>
        g.sub_types.map((s) => ({
          id: s.id,
          name: s.name,
          projectTypeId: g.project_type_id,
          projectTypeName: g.project_type_name,
        }))
      ),
    [subTypeGroups]
  );
  const selectedSub = flatSubTypes.find((s) => s.id === subTypeId);

  const convertMutation = useMutation({
    mutationFn: async () => {
      const response = await api.intake.convert(intake!.id, {
        title: title.trim() || intake!.title,
        project_type_id: selectedSub!.projectTypeId,
        project_sub_type_id: subTypeId,
        priority,
        owner_id: ownerId || null,
        expected_start: expectedStart || null,
        expected_finish: expectedFinish || null,
      });
      return (response.data as any).data as IntakeConvertResult;
    },
    onSuccess: (result) => {
      // A2 新鲜度：转换改变收件箱、项目面与仪表盘计数
      queryClient.invalidateQueries({ queryKey: queryKeys.intake.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      localStorage.setItem(SUBTYPE_STORAGE, subTypeId);
      onConverted(result);
    },
    onError: (err: any) => {
      const code = err?.response?.data?.error;
      if (code === 'invalid_status') {
        setError(t('intake:triage.invalidStatus'));
        queryClient.invalidateQueries({ queryKey: queryKeys.intake.all });
      } else if (code === 'invalid_type') {
        setError(err?.response?.data?.message || t('intake:errors.generic'));
      } else {
        setError(err?.response?.data?.message || err?.message || t('intake:errors.generic'));
      }
    },
  });

  const canSubmit = subTypeId !== '' && title.trim() !== '' && !convertMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          borderColor: 'var(--border-color)',
        }}
        data-testid="intake-triage-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t('intake:triage.title')}</DialogTitle>
          <DialogDescription>{intake?.title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="triage-title">{t('intake:capture.previewTitle')}</Label>
            <Input
              id="triage-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-required="true"
              data-testid="triage-title"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="triage-subtype">{t('intake:triage.typeLabel')}</Label>
              <Select value={subTypeId} onValueChange={setSubTypeId}>
                <SelectTrigger id="triage-subtype" className="dialog-field" data-testid="triage-subtype">
                  <SelectValue placeholder={t('intake:triage.typePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {flatSubTypes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.projectTypeName ? `${s.projectTypeName} / ${s.name}` : s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="triage-priority">{t('intake:triage.priority')}</Label>
              <Select
                value={String(priority)}
                onValueChange={(v) => setPriority(Number(v))}
              >
                <SelectTrigger id="triage-priority" className="dialog-field" data-testid="triage-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((p) => (
                    <SelectItem key={p} value={String(p)}>{`P${p}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="triage-owner">{t('intake:triage.owner')}</Label>
            <Select value={ownerId || 'none'} onValueChange={(v) => setOwnerId(v === 'none' ? '' : v)}>
              <SelectTrigger id="triage-owner" className="dialog-field" data-testid="triage-owner">
                <SelectValue placeholder={t('intake:triage.ownerPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('intake:triage.noOwner')}</SelectItem>
                {activePeople.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="triage-start">{t('intake:triage.expectedStart')}</Label>
              <Input
                id="triage-start"
                type="date"
                value={expectedStart}
                onChange={(e) => setExpectedStart(e.target.value)}
                data-testid="triage-start"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="triage-finish">{t('intake:triage.expectedFinish')}</Label>
              <Input
                id="triage-finish"
                type="date"
                value={expectedFinish}
                onChange={(e) => setExpectedFinish(e.target.value)}
                data-testid="triage-finish"
              />
            </div>
          </div>

          <Alert>
            <Info size={16} />
            <AlertDescription data-testid="triage-baseline-note">
              {expectedStart
                ? t('intake:triage.baselineNote')
                : t('intake:triage.baselineUnsetNote')}
            </AlertDescription>
          </Alert>

          {error && (
            <Alert variant="destructive" data-testid="triage-error">
              <AlertCircle size={16} />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" className="dialog-secondary-btn" onClick={onClose} disabled={convertMutation.isPending}>
            {t('intake:triage.cancel')}
          </Button>
          <Button
            type="button"
            className="dialog-primary-btn"
            disabled={!canSubmit}
            onClick={() => convertMutation.mutate()}
            data-testid="triage-submit"
          >
            {convertMutation.isPending && <Spinner className="mr-2" size="sm" />}
            {convertMutation.isPending ? t('intake:triage.busy') : t('intake:triage.submit')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isImeComposing } from '../../lib/ime';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';
import { parseIntakeLine, splitIntakeText } from '../../lib/intakeParse';
import { INTAKE_SOURCE_CHANNELS, type IntakeCaptureInput, type IntakeSourceChannel } from '../../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert, AlertDescription } from '../ui/alert';
import { ToastAction } from '../ui/toast';
import { useToast } from '../../hooks/use-toast';
import './QuickCaptureDialog.css';

/**
 * QuickCaptureDialog —— 快速捕捉（I01 设计稿 §5.2）。
 *
 * 交互定死（收敛评审 2026-11-10）：
 * - 文本区默认单行语义：无换行时 Enter 提交；有换行自动进入多行
 *   （一行一条，预览可改标题，共用来源）；
 * - Ctrl+Enter 恒为提交；模式切换为分段控件（无原生 checkbox）；
 * - 编号/期望交付日：单行模式下自动提取且可改（多行为逐行提示，S1 不可改）；
 * - 提出人/备注收进"更多"折叠区；来源记住上次选择；
 * - 「收入并继续」清空正文/编号/日期，保留来源并回焦输入区；
 * - 失败保留全部输入，可重试；成功 toast 计数（重复被跳过也如实报数）。
 *
 * 2026-11-10 白盒事故硬化：外壳背景/文字/边框显式走应用自身令牌层
 * （body 级 --bg-primary/--text-primary/--border-color——index.css 事实标准），
 * 不再依赖 PortalThemeProvider 复制的 HSL 变量链（该链在陈旧页面/HMR
 * 半更新下会把弹层灌成白色）。
 */
const SOURCE_STORAGE = 'intake-source';

interface CaptureItem extends IntakeCaptureInput {
  title: string;
}

export function QuickCaptureDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  // G-13 收口（批 B）：受控打开（Alt+N/各页按钮）记住触发元素，关闭后焦点返回
  const triggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) triggerRef.current = document.activeElement as HTMLElement | null;
  }, [open]);

  const [text, setText] = useState('');
  const [mode, setMode] = useState<'auto' | 'single'>('auto');
  const [source, setSource] = useState<IntakeSourceChannel>('internal');
  const [refValue, setRefValue] = useState('');
  const [refTouched, setRefTouched] = useState(false);
  const [finishValue, setFinishValue] = useState('');
  const [finishTouched, setFinishTouched] = useState(false);
  const [requester, setRequester] = useState('');
  const [note, setNote] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [rowTitles, setRowTitles] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  // 打开时恢复上次来源；焦点由 DialogContent.onOpenAutoFocus 显式交给输入区
  // （Radix 默认聚焦首个可聚焦元素=分段按钮，实锤焦点环落在"一行一条"上）
  useEffect(() => {
    if (open) {
      const saved = localStorage.getItem(SOURCE_STORAGE);
      if (saved && (INTAKE_SOURCE_CHANNELS as readonly string[]).includes(saved)) {
        setSource(saved as IntakeSourceChannel);
      }
    }
  }, [open]);

  const { lines, multi } = useMemo(() => splitIntakeText(text, mode), [text, mode]);
  const hasContent = lines.length > 0;
  const singleParsed = useMemo(
    () => (hasContent ? parseIntakeLine(lines[0]) : null),
    [hasContent, lines]
  );
  const rowParsed = useMemo(() => lines.map((line) => parseIntakeLine(line)), [lines]);

  // 单行模式：自动提取的 ref/日期填充输入框（用户改过则不再覆盖）
  useEffect(() => {
    if (!refTouched) setRefValue(singleParsed?.source_ref ?? '');
  }, [singleParsed?.source_ref, refTouched]);
  useEffect(() => {
    if (!finishTouched) setFinishValue(singleParsed?.expected_finish ?? '');
  }, [singleParsed?.expected_finish, finishTouched]);

  const untitled = (ref: string | null): string =>
    `${t('intake:capture.untitled')}${ref ? `(${ref})` : ''}`;

  const rowTitleOf = (index: number, parsed: { title: string | null; source_ref: string | null }): string => {
    const edited = rowTitles[index]?.trim();
    if (edited) return edited;
    return parsed.title ?? untitled(parsed.source_ref);
  };

  const captureMutation = useMutation({
    mutationFn: async (vars: { items: CaptureItem[]; keepOpen: boolean }) => {
      if (vars.items.length === 1) {
        const response = await api.intake.capture(vars.items[0]);
        return {
          created: 1,
          skipped: 0,
          warnings: (response.data as { warnings?: { type: string; existing_id: string }[] }).warnings ?? [],
        };
      }
      const response = await api.intake.captureBatch(vars.items);
      const payload = response.data as {
        data: { created: unknown[]; skipped: { index: number }[] };
      };
      return {
        created: payload.data.created.length,
        skipped: payload.data.skipped.length,
        warnings: [] as { type: string; existing_id: string }[],
      };
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.intake.all });
      const title =
        result.created === 1
          ? t('intake:capture.capturedOne')
          : t('intake:capture.capturedMany', { count: result.created });
      const parts: string[] = [];
      if (result.skipped > 0) parts.push(t('intake:capture.skippedInfo', { count: result.skipped }));
      if (result.warnings.some((w) => w.type === 'duplicate_title')) {
        parts.push(t('intake:capture.duplicateTitle'));
      }
      // U21（D20 批5）：成功 toast **恒带**「去分流」动作——日常月度收集
      // 可无视，月中紧急 A 路径（未谈清→快录）直达收件箱分流
      toast({
        title,
        description: parts.length > 0 ? parts.join('；') : undefined,
        action: (
          <ToastAction
            altText={t('intake:capture.goTriage')}
            onClick={() => {
              onClose();
              navigate('/projects?tab=intake');
            }}
            data-testid="capture-go-triage"
          >
            {t('intake:capture.goTriage')}
          </ToastAction>
        ),
      });
      setError(null);
      // 继续：清正文/编号/日期/提出人/备注，保留来源；关闭：整域复位
      setText('');
      setRowTitles({});
      setRefValue('');
      setRefTouched(false);
      setFinishValue('');
      setFinishTouched(false);
      setRequester('');
      setNote('');
      if (!vars.keepOpen) {
        onClose();
      } else {
        textRef.current?.focus();
      }
    },
    onError: (err: any) => {
      // 失败保留输入（E2）；错误就地显示可重试
      const code = err?.response?.data?.error;
      if (code === 'duplicate_source_ref') {
        setError(t('intake:errors.duplicate'));
      } else {
        setError(err?.response?.data?.message || err?.message || t('intake:capture.loadError'));
      }
    },
  });

  const buildItems = (): CaptureItem[] => {
    if (!hasContent) return [];
    if (multi) {
      return rowParsed.map((parsed, index) => ({
        title: rowTitleOf(index, parsed),
        raw_text: lines[index],
        source_channel: source,
        source_ref: parsed.source_ref ?? undefined,
        priority_hint: parsed.priority_hint ?? undefined,
        expected_finish: parsed.expected_finish ?? undefined,
        requester: requester || undefined,
        note: note || undefined,
      }));
    }
    const title = rowTitleOf(0, singleParsed!);
    // D13（2026-11-10 裁决 a）：字段被编辑过（含清空）后以字段值为准，不回落解析值；
    // 未编辑时解析值已由上方 useEffect 自动填入字段，回落仅兜底同帧竞态。
    const effectiveRef = refTouched ? refValue : (refValue || singleParsed?.source_ref || '');
    const effectiveFinish = finishTouched
      ? finishValue
      : (finishValue || singleParsed?.expected_finish || '');
    return [
      {
        title,
        raw_text: mode === 'single' ? text : lines[0],
        source_channel: source,
        source_ref: effectiveRef || undefined,
        priority_hint: singleParsed?.priority_hint ?? undefined,
        expected_finish: effectiveFinish || undefined,
        requester: requester || undefined,
        note: note || undefined,
      },
    ];
  };

  const submit = (keepOpen: boolean) => {
    const items = buildItems();
    if (items.length === 0) return;
    localStorage.setItem(SOURCE_STORAGE, source);
    captureMutation.mutate({ items, keepOpen });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 输入法组合态：Enter 是确认候选词，不是提交
    if (isImeComposing(e)) return;
    // 输入法组合态：Enter 是确认候选词，不是提交
    
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit(false);
      return;
    }
    // 无换行内容 + auto 模式：Enter 直接提交（单行快路径）
    if (e.key === 'Enter' && !e.shiftKey && mode === 'auto' && !text.includes('\n')) {
      e.preventDefault();
      submit(false);
    }
  };

  const modeButton = (value: 'auto' | 'single', label: string, testId: string) => (
    <button
      type="button"
      className="qc-mode-btn"
      data-testid={testId}
      aria-pressed={mode === value}
      style={
        mode === value
          ? { background: 'var(--bg-tertiary)', color: 'var(--text-primary)', borderColor: 'var(--border-color)' }
          : { background: 'transparent', color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }
      }
      onClick={() => setMode(value)}
    >
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        className="max-w-xl max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          borderColor: 'var(--border-color)',
          maxWidth: 520,
        }}
        data-testid="quick-capture-dialog"
        onOpenAutoFocus={(event) => {
          // 捕捉第一意图是"打字"，不是操作分段键——阻止 Radix 默认聚焦
          event.preventDefault();
          textRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('intake:capture.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('intake:capture.hint')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="intake-text">{t('intake:capture.fieldLabel')}</Label>
              <div className="flex gap-1">
                {modeButton('auto', t('intake:capture.onePerLine'), 'intake-mode-one')}
                {modeButton('single', t('intake:capture.wholeBlock'), 'intake-mode-block')}
              </div>
            </div>
            <Textarea
              id="intake-text"
              ref={textRef}
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('intake:capture.placeholder')}
              aria-required="true"
              data-testid="intake-text"
            />
            {!hasContent && (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }} data-testid="intake-empty-hint">
                {t('intake:capture.emptyHint')}
              </p>
            )}
            {multi && (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }} data-testid="intake-multi-hint">
                {t('intake:capture.multiHint')}
              </p>
            )}
          </div>

          {/* 已识别 chips：解析结果紧贴输入区，点击跳到对应字段（B2 自标注/冲突可见）。
              D13：chips 只在"解析值即提交值"时显示——字段被编辑/清空后不再把
              解析值呈现为将提交值（capture-stale-chips 断言） */}
          {!multi && hasContent &&
            (singleParsed?.priority_hint ||
              (!refTouched && singleParsed?.source_ref) ||
              (!finishTouched && singleParsed?.expected_finish)) && (
              <div className="qc-parsed" data-testid="intake-parsed-chips">
                <span className="qc-parsed-label" style={{ color: 'var(--text-secondary)' }}>
                  {t('intake:capture.parsed')}
                </span>
                {!refTouched && singleParsed?.source_ref && (
                  <button
                    type="button"
                    className="qc-chip"
                    title={t('intake:capture.sourceRef')}
                    onClick={() => document.getElementById('intake-ref')?.focus()}
                  >
                    {singleParsed.source_ref}
                  </button>
                )}
                {singleParsed?.priority_hint && (
                  <span className="qc-chip">{`P${singleParsed.priority_hint}`}</span>
                )}
                {!finishTouched && singleParsed?.expected_finish && (
                  <button
                    type="button"
                    className="qc-chip"
                    title={t('intake:capture.expectedDelivery')}
                    onClick={() => document.getElementById('intake-finish')?.focus()}
                  >
                    {singleParsed.expected_finish}
                  </button>
                )}
              </div>
            )}

          {hasContent && (
            <div className="space-y-2" data-testid="intake-preview">
              <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                {t('intake:capture.preview', { count: multi ? lines.length : 1 })}
              </div>
              {multi ? (
                <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                  {rowParsed.map((parsed, index) => {
                    const dup =
                      parsed.source_ref !== null &&
                      rowParsed.findIndex(
                        (other, i) => i < index && other.source_ref === parsed.source_ref
                      ) >= 0;
                    return (
                      <div
                        key={index}
                        className="qc-preview-row"
                        style={{
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        <Input
                          aria-label={t('intake:capture.previewTitle')}
                          className="qc-preview-title"
                          value={rowTitles[index] ?? parsed.title ?? ''}
                          placeholder={parsed.title ?? untitled(parsed.source_ref)}
                          onChange={(e) => setRowTitles((prev) => ({ ...prev, [index]: e.target.value }))}
                          data-testid={`intake-row-title-${index}`}
                        />
                        <span className="qc-preview-chip" style={{ color: 'var(--text-secondary)' }}>
                          {parsed.priority_hint ? `P${parsed.priority_hint}` : ''}
                        </span>
                        {parsed.source_ref && (
                          <span
                            className="qc-preview-chip qc-preview-ref"
                            style={{ color: 'var(--text-secondary)' }}
                            title={parsed.source_ref}
                          >
                            {parsed.source_ref}
                          </span>
                        )}
                        {dup && (
                          <span
                            className="qc-preview-chip"
                            style={{ color: 'var(--status-warning-text, var(--text-primary))' }}
                            data-testid={`intake-row-dup-${index}`}
                          >
                            {t('intake:capture.inBatchDuplicate')}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <span>{singleParsed?.title ?? untitled(singleParsed?.source_ref ?? null)}</span>
                  {singleParsed?.priority_hint && (
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      P{singleParsed.priority_hint}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="intake-source">{t('intake:capture.source')}</Label>
              <Select
                value={source}
                onValueChange={(v) => setSource(v as IntakeSourceChannel)}
              >
                <SelectTrigger id="intake-source" className="dialog-field" data-testid="intake-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTAKE_SOURCE_CHANNELS.map((channel) => (
                    <SelectItem key={channel} value={channel}>
                      {t(`intake:sources.${channel}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!multi && (
              <div className="space-y-2">
                <Label htmlFor="intake-ref">{t('intake:capture.sourceRef')}</Label>
                <Input
                  id="intake-ref"
                  value={refValue}
                  onChange={(e) => {
                    setRefValue(e.target.value);
                    setRefTouched(true);
                  }}
                  placeholder={t('intake:capture.sourceRefPlaceholder')}
                  data-testid="intake-ref"
                />
              </div>
            )}
            {!multi && (
              <div className="space-y-2">
                <Label htmlFor="intake-finish">{t('intake:capture.expectedDelivery')}</Label>
                <Input
                  id="intake-finish"
                  type="date"
                  value={finishValue}
                  onChange={(e) => {
                    setFinishValue(e.target.value);
                    setFinishTouched(true);
                  }}
                  aria-describedby="intake-finish-hint"
                  data-testid="intake-finish"
                />
              </div>
            )}
            {!multi && (
              <p
                id="intake-finish-hint"
                className="text-xs self-end"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('intake:capture.expectedDeliveryHint')}
              </p>
            )}
          </div>

          <div>
            <button
              type="button"
              className="qc-more-toggle"
              style={{ color: 'var(--text-secondary)' }}
              onClick={() => setShowMore((v) => !v)}
              aria-expanded={showMore}
              data-testid="intake-more-toggle"
            >
              {showMore ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {showMore ? t('intake:capture.less') : t('intake:capture.more')}
            </button>
            {showMore && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="space-y-2">
                  <Label htmlFor="intake-requester">{t('intake:capture.requester')}</Label>
                  <Input
                    id="intake-requester"
                    value={requester}
                    onChange={(e) => setRequester(e.target.value)}
                    data-testid="intake-requester"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="intake-note">{t('intake:capture.note')}</Label>
                  <Input
                    id="intake-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    data-testid="intake-note"
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <Alert variant="destructive" data-testid="intake-capture-error">
              <AlertCircle size={16} />
              <AlertDescription>
                <span>{error}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="dialog-secondary-btn"
                  style={{ marginLeft: 8 }}
                  onClick={() => captureMutation.mutate({ items: buildItems(), keepOpen: true })}
                >
                  {t('intake:capture.retry')}
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button
            type="button"
            variant="outline"
            className="dialog-secondary-btn"
            disabled={captureMutation.isPending || !hasContent}
            onClick={() => submit(true)}
            data-testid="intake-submit-continue"
          >
            {t('intake:capture.submitAndContinue')}
          </Button>
          <Button
            type="button"
            className="dialog-primary-btn"
            disabled={captureMutation.isPending || !hasContent}
            onClick={() => submit(false)}
            data-testid="intake-submit"
          >
            {t('intake:capture.submit')}
            <kbd className="qc-kbd">{multi ? 'Ctrl+⏎' : '⏎'}</kbd>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

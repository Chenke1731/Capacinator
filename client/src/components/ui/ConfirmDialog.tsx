import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './dialog';
import { Button } from './button';

/**
 * ConfirmDialog —— 共享确认框（D-04 Stage 1：2026-11-10 迁移到 Radix Dialog 原语）。
 *
 * 迁移动机：原实现消费全局旧 `.modal-*` 类，任何页面 CSS 的裸 `.modal-*`
 * 覆盖都会改写所有确认框（同类泄漏普查 F-12）。迁移后只消费 `ui/dialog`
 * + `dialog.css` 原语（关闭钮右上、主/次/危险按钮三态）。
 * Props 保持不变——5 个调用点零改动；Esc/遮罩点击/滚动锁/焦点管理由 Radix 提供。
 */
interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'default' | 'danger';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  variant = 'default'
}) => {
  const { t } = useTranslation();
  const resolvedConfirmText = confirmText ?? t('common:confirm');
  const resolvedCancelText = cancelText ?? t('common:cancel');

  return (
    <Dialog open={isOpen} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent
        className="max-w-md"
        style={{
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          borderColor: 'var(--border-color)',
        }}
        data-testid="confirm-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {variant === 'danger' && (
              <AlertTriangle size={20} style={{ color: 'var(--status-danger-text)' }} aria-hidden="true" />
            )}
            {title}
          </DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="dialog-secondary-btn" onClick={onCancel}>
            {resolvedCancelText}
          </Button>
          <Button
            type="button"
            className={variant === 'danger' ? 'dialog-danger-btn' : 'dialog-primary-btn'}
            onClick={onConfirm}
          >
            {resolvedConfirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

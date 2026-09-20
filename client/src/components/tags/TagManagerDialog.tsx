import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Tag as TagIcon, Trash2 } from 'lucide-react';
import { api } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import type { Tag } from '../../types';

/**
 * Tag management: rename and delete tags. Dictionary-level changes also
 * invalidate the projects cache so list badges re-render with fresh names.
 */
export function TagManagerDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<Tag | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const { data: tagsData } = useQuery({
    queryKey: queryKeys.tags.list(),
    queryFn: async () => {
      const response = await api.tags.list();
      return response.data;
    },
    enabled: isOpen
  });
  const tags: Tag[] = (tagsData?.data as Tag[]) || [];

  const invalidateBoth = () => {
    // tags dictionary + projects (badges carry tag names/colors)
    queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
  };

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const response = await api.tags.update(id, { name });
      return response.data;
    },
    onSuccess: () => {
      setEditingId(null);
      invalidateBoth();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.tags.delete(id);
    },
    onSuccess: () => {
      setDeleting(null);
      invalidateBoth();
    }
  });

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
  };

  const commitRename = () => {
    const trimmed = editName.trim();
    if (editingId != null && trimmed && trimmed !== tags.find((tg) => tg.id === editingId)?.name) {
      renameMutation.mutate({ id: editingId, name: trimmed });
    } else {
      setEditingId(null);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="tag-manager-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TagIcon size={18} />
              {t('projects:tags.manageTitle')}
            </DialogTitle>
            <DialogDescription>{t('projects:tags.manageDescription')}</DialogDescription>
          </DialogHeader>

          <div className="tag-manager-list" data-testid="tag-manager-list">
            {tags.length === 0 && (
              <p className="text-muted">{t('projects:tags.noneYet')}</p>
            )}
            {tags.map((tag) => (
              <div key={tag.id} className="tag-manager-row">
                {editingId === tag.id ? (
                  <Input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="tag-rename-input"
                    data-testid={`tag-rename-${tag.id}`}
                  />
                ) : (
                  <button
                    type="button"
                    className="tag-chip tag-chip-static"
                    style={tag.color ? { backgroundColor: tag.color, borderColor: tag.color, color: '#fff' } : undefined}
                    onClick={() => startEdit(tag)}
                    title={t('projects:tags.rename')}
                  >
                    {tag.name}
                  </button>
                )}
                <span className="text-muted tag-usage">
                  {t('projects:tags.usageCount', { count: tag.project_count ?? 0 })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="tag-delete-btn"
                  onClick={() => setDeleting(tag)}
                  title={t('projects:tags.delete')}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={!!deleting}
        title={t('projects:tags.deleteTitle')}
        message={t('projects:tags.deleteMessage', {
          name: deleting?.name ?? '',
          count: deleting?.project_count ?? 0
        })}
        confirmText={t('common:delete')}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
        variant="danger"
      />
    </>
  );
}

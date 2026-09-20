import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GitBranch } from 'lucide-react';
import { api } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useUser } from '../../contexts/UserContext';

interface CreateScenarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentScenario?: any;
}

export const CreateScenarioModal: React.FC<CreateScenarioModalProps> = ({
  isOpen,
  onClose,
  parentScenario
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scenarioType, setScenarioType] = useState<'branch' | 'sandbox'>('branch');
  const { currentUser } = useUser();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: any) => api.scenarios.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scenarios.all });
      handleClose();
      setName('');
      setDescription('');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !currentUser) return;

    createMutation.mutate({
      name: name.trim(),
      description: description.trim(),
      parent_scenario_id: parentScenario?.id,
      created_by: currentUser.id,
      scenario_type: scenarioType
    });
  };

  const handleClose = () => {
    // Give time for animation before calling onClose
    setTimeout(() => onClose(), 200);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('scenarios:modal.createTitle')}</DialogTitle>
          <DialogDescription>
            {t('scenarios:modal.createDescription')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {parentScenario && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-md" role="status">
                <GitBranch size={16} aria-hidden="true" />
                <span className="text-sm">{t('scenarios:modal.branchingFrom')} <strong>{parentScenario.name}</strong></span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="scenario-name">{t('scenarios:modal.scenarioName')} <span aria-hidden="true">*</span><span className="sr-only">{t('scenarios:modal.a11yRequired')}</span></Label>
              <Input
                id="scenario-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('scenarios:modal.namePlaceholder')}
                required
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="scenario-description">{t('common:description')}</Label>
              <Textarea
                id="scenario-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('scenarios:modal.descriptionPlaceholder')}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="scenario-type">{t('scenarios:modal.scenarioType')}</Label>
              <Select
                value={scenarioType}
                onValueChange={(value) => setScenarioType(value as 'branch' | 'sandbox')}
              >
                <SelectTrigger id="scenario-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="branch">{t('scenarios:modal.typeBranch')}</SelectItem>
                  <SelectItem value="sandbox">{t('scenarios:modal.typeSandbox')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              {t('common:cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? t('scenarios:modal.creating') : t('scenarios:modal.createScenario')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

interface EditScenarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenario: any;
}

export const EditScenarioModal: React.FC<EditScenarioModalProps> = ({
  isOpen,
  onClose,
  scenario
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState(scenario?.name || '');
  const [description, setDescription] = useState(scenario?.description || '');
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.scenarios.update(scenario.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scenarios.all });
      handleClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    updateMutation.mutate({
      name: name.trim(),
      description: description.trim()
    });
  };

  const handleClose = () => {
    // Give time for animation before calling onClose
    setTimeout(() => onClose(), 200);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('scenarios:modal.editTitle')}</DialogTitle>
          <DialogDescription>
            {t('scenarios:modal.editDescription')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-scenario-name">{t('scenarios:modal.scenarioName')} <span aria-hidden="true">*</span><span className="sr-only">{t('scenarios:modal.a11yRequired')}</span></Label>
              <Input
                id="edit-scenario-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('scenarios:modal.namePlaceholder')}
                required
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-scenario-description">{t('common:description')}</Label>
              <Textarea
                id="edit-scenario-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('scenarios:modal.descriptionPlaceholder')}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              {t('common:cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending ? t('common:saving') : t('scenarios:modal.saveChanges')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenario: any;
  onConfirm: () => void;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  onClose,
  scenario,
  onConfirm
}) => {
  const { t } = useTranslation();
  const [confirmText, setConfirmText] = useState('');
  const isDeleteEnabled = confirmText === scenario?.name;

  const handleConfirm = () => {
    if (isDeleteEnabled) {
      onConfirm();
      handleClose();
    }
  };

  const handleClose = () => {
    // Give time for animation before calling onClose
    setTimeout(() => onClose(), 200);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('scenarios:modal.deleteTitle')}</DialogTitle>
          <DialogDescription>
            {t('scenarios:modal.deleteDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md" role="alert">
            <p className="text-sm text-red-800 dark:text-red-200">
              <strong>{t('scenarios:modal.warning')}</strong>
              {' '}{t('scenarios:modal.deleteWarningPrefix')} <strong>{scenario?.name}</strong> {t('scenarios:modal.deleteWarningSuffix')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-delete">
              {t('scenarios:modal.typeToConfirm')} <strong>{scenario?.name}</strong> {t('scenarios:modal.toConfirmDeletion')} <span aria-hidden="true">*</span><span className="sr-only">{t('scenarios:modal.a11yRequired')}</span>
            </Label>
            <Input
              id="confirm-delete"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={t('scenarios:modal.namePlaceholder')}
              aria-required="true"
              aria-describedby="delete-warning"
            />
            <span id="delete-warning" className="sr-only">{t('scenarios:modal.deleteSrHelp')}</span>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            {t('common:cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!isDeleteEnabled}
            onClick={handleConfirm}
          >
            {t('scenarios:modal.deleteScenario')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
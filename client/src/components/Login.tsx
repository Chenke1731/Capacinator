import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import type { Person } from '../types';
import { useUser } from '../contexts/UserContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';

interface LoginProps {
  onClose?: () => void;
}

export const Login: React.FC<LoginProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { login } = useUser();

  // Fetch all people for the dropdown
  const { data: people, isLoading, error } = useQuery({
    queryKey: queryKeys.people.all,
    queryFn: async () => {
      console.log('🔄 Fetching people data...');
      const response = await api.people.list();
      // console.log('✅ People data received:', response.data.data?.length, 'people');
      return response.data.data as Person[];
    },
  });

  // console.log('👥 Login component state:', { 
  //   peopleCount: people?.length, 
  //   isLoading, 
  //   hasError: !!error,
  //   selectedPersonId 
  // });

  const handleLogin = async () => {
    if (!selectedPersonId) return;

    setIsLoggingIn(true);
    setLoginError(null);

    try {
      await login(selectedPersonId);
      if (onClose) {
        onClose();
      }
    } catch (err) {
      console.error('Login failed:', err);
      setLoginError(t('auth:loginFailed'));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handlePersonSelect = (personId: string) => {
    setSelectedPersonId(personId);
  };

  if (isLoading) {
    return (
      <Dialog open={true} modal>
        <DialogContent 
          className="!w-[350px] !max-w-[350px] [&>button]:hidden" 
          onPointerDownOutside={(e) => e.preventDefault()} 
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="pb-4">
            <DialogTitle className="text-xl font-semibold">{t('auth:selectYourProfile')}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('auth:chooseProfile')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">{t('auth:loadingEmployees')}</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (error) {
    return (
      <Dialog open={true} modal>
        <DialogContent 
          className="!w-[350px] !max-w-[350px] [&>button]:hidden" 
          onPointerDownOutside={(e) => e.preventDefault()} 
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="pb-4">
            <DialogTitle className="text-xl font-semibold">{t('common:error')}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('auth:loadEmployeesFailed')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-6 border-t border-border/50">
            <Button onClick={() => window.location.reload()} className="min-w-[100px]">
              {t('common:retry')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} modal>
      <DialogContent 
        className="!w-[380px] !max-w-[380px] [&>button]:hidden" 
        style={{ padding: '24px' }}
        onPointerDownOutside={(e) => e.preventDefault()} 
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-1.5 pb-4">
          <DialogTitle className="text-lg font-semibold">{t('auth:selectYourProfile')}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t('auth:chooseProfile')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="person-select" className="text-sm font-medium">{t('auth:whoAreYou')}</Label>
            <Select value={selectedPersonId} onValueChange={handlePersonSelect}>
              <SelectTrigger id="person-select" className="w-full">
                <SelectValue placeholder={t('auth:selectNamePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {people?.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name} {person.primary_role_name && `(${person.primary_role_name})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {loginError && (
            <div className="text-sm text-destructive text-center">
              {loginError}
            </div>
          )}
          <DialogFooter className="pt-6">
            <div className="w-full space-y-3">
              <Button
                type="submit"
                disabled={!selectedPersonId || isLoggingIn}
                className="w-full"
              >
                {isLoggingIn ? t('auth:signingIn') : t('auth:continue')}
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                {t('auth:savedForFuture')}
              </p>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
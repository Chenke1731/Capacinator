/**
 * GitHubConnectionManager Component
 * Feature: 005-github-auth-user-link
 * Tasks: T020, T022
 *
 * Manages GitHub account connections for the current user.
 * Displays existing connections and provides UI to connect new accounts.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useGitHubConnections,
  useInitiateOAuth,
  useUpdateGitHubConnection,
  useDeleteGitHubConnection,
  type GitHubConnection,
} from '../hooks/useGitHubConnections';
import { getLocale } from '../i18n';
import { GitHubPATInput } from './GitHubPATInput';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Github, Trash2, CheckCircle2, AlertCircle, Clock, Loader2, ChevronDown, Key } from 'lucide-react';

export function GitHubConnectionManager() {
  const { t } = useTranslation();
  const [deleteConnectionId, setDeleteConnectionId] = useState<number | null>(null);
  const [showPATInput, setShowPATInput] = useState(false);

  // Fetch GitHub connections
  const { data: connections, isLoading, error } = useGitHubConnections({
    includeInactive: false,
    includeAssociations: true,
  });

  // Mutations
  const { mutate: initiateOAuth, isPending: isInitiating } = useInitiateOAuth();
  const { mutate: updateConnection, isPending: isUpdating } = useUpdateGitHubConnection();
  const { mutate: deleteConnection, isPending: isDeleting } = useDeleteGitHubConnection();

  const handleConnectOAuth = () => {
    initiateOAuth();
  };

  const handleConnectPAT = () => {
    setShowPATInput(true);
  };

  const handlePATSuccess = () => {
    setShowPATInput(false);
  };

  const handlePATCancel = () => {
    setShowPATInput(false);
  };

  const handleSetDefault = (id: number) => {
    updateConnection({ id, data: { is_default: true } });
  };

  const handleDisconnect = (id: number) => {
    setDeleteConnectionId(id);
  };

  const confirmDisconnect = () => {
    if (deleteConnectionId) {
      deleteConnection(deleteConnectionId);
      setDeleteConnectionId(null);
    }
  };

  const getStatusBadge = (connection: GitHubConnection) => {
    switch (connection.status) {
      case 'active':
        return (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {t('gitSync:github.status.active')}
          </Badge>
        );
      case 'expired':
        return (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            {t('gitSync:github.status.expired')}
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            {t('gitSync:github.status.error')}
          </Badge>
        );
      case 'revoked':
        return (
          <Badge variant="secondary" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            {t('gitSync:github.status.revoked')}
          </Badge>
        );
      default:
        return null;
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('gitSync:github.never');
    return new Date(dateString).toLocaleDateString(getLocale(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('gitSync:github.title')}</CardTitle>
          <CardDescription>
            {t('gitSync:github.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('gitSync:github.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
            <p className="text-sm text-muted-foreground">
              {t('gitSync:github.loadFailed')}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasConnections = connections && connections.length > 0;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('gitSync:github.title')}</CardTitle>
              <CardDescription>
                {t('gitSync:github.description')}
              </CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={isInitiating} className="gap-2">
                  {isInitiating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('gitSync:github.connecting')}
                    </>
                  ) : (
                    <>
                      <Github className="h-4 w-4" />
                      {t('gitSync:github.connectAccount')}
                      <ChevronDown className="h-4 w-4 ml-1" />
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleConnectOAuth}>
                  <Github className="h-4 w-4 mr-2" />
                  {t('gitSync:github.connectOAuth')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleConnectPAT}>
                  <Key className="h-4 w-4 mr-2" />
                  {t('gitSync:github.connectPAT')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* PAT Input Form */}
          {showPATInput && (
            <GitHubPATInput onSuccess={handlePATSuccess} onCancel={handlePATCancel} />
          )}

          {/* Connections List or Empty State */}
          {!hasConnections ? (
            <div className="text-center py-8">
              <Github className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-4">
                {t('gitSync:github.empty')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('gitSync:github.emptyHint')}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {connections.map((connection) => (
                <div
                  key={connection.id}
                  className="flex items-start justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-start gap-3 flex-1">
                    <Github className="h-5 w-5 mt-0.5 text-muted-foreground" />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {connection.github_username}
                        </span>
                        {connection.is_default && (
                          <Badge variant="outline">{t('gitSync:github.default')}</Badge>
                        )}
                        {getStatusBadge(connection)}
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <div>
                          {t('gitSync:github.method')}: {connection.connection_method.toUpperCase()}
                        </div>
                        <div>{t('gitSync:github.connected')}: {formatDate(connection.created_at)}</div>
                        {connection.last_used_at && (
                          <div>
                            {t('gitSync:github.lastUsed')}: {formatDate(connection.last_used_at)}
                          </div>
                        )}
                        {connection.associations && connection.associations.length > 0 && (
                          <div>
                            {t('gitSync:github.linkedTo', {
                              count: connection.associations.length,
                              type: connection.associations.length === 1
                                ? t('gitSync:github.resourceOne')
                                : t('gitSync:github.resourceOther'),
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!connection.is_default && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetDefault(connection.id)}
                        disabled={isUpdating}
                      >
                        {t('gitSync:github.setAsDefault')}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDisconnect(connection.id)}
                      disabled={isDeleting}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disconnect Confirmation Dialog */}
      <AlertDialog
        open={deleteConnectionId !== null}
        onOpenChange={() => setDeleteConnectionId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('gitSync:github.disconnectTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('gitSync:github.disconnectDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDisconnect}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('gitSync:github.disconnect')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

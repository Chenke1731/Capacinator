/**
 * useGitHubConnections Hook
 * Feature: 005-github-auth-user-link
 * Task: T021
 *
 * Provides React Query hooks for managing GitHub connections
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { useToast } from './use-toast';

export interface GitHubConnection {
  id: number;
  user_id: number;
  github_user_id: number;
  github_username: string;
  connection_method: 'oauth' | 'pat';
  token_expires_at: string | null;
  scopes: string[];
  github_base_url: string;
  status: 'active' | 'expired' | 'revoked' | 'error';
  is_default: boolean;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  associations?: Array<{
    person_id: number;
    person_name: string;
    person_email: string;
    association_type: 'automatic' | 'manual';
  }>;
}

/**
 * Hook to fetch GitHub connections for the current user
 */
export function useGitHubConnections(options?: {
  includeInactive?: boolean;
  includeAssociations?: boolean;
}) {
  const { toast } = useToast();
  const { t } = useTranslation();

  return useQuery({
    queryKey: queryKeys.githubConnections.list(options),
    queryFn: async () => {
      const response = await api.githubConnections.list(options);
      return response.data.data as GitHubConnection[];
    },
    onError: (error: any) => {
      toast({
        title: t('gitSync:github.toasts.loadFailed'),
        description: error.response?.data?.error || error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to fetch a single GitHub connection
 */
export function useGitHubConnection(
  id: number | undefined,
  options?: { includeAssociations?: boolean }
) {
  const { toast } = useToast();
  const { t } = useTranslation();

  return useQuery({
    queryKey: queryKeys.githubConnections.detail(id, options),
    queryFn: async () => {
      if (!id) return null;
      const response = await api.githubConnections.get(id, options);
      return response.data as GitHubConnection;
    },
    enabled: !!id,
    onError: (error: any) => {
      toast({
        title: t('gitSync:github.toasts.loadOneFailed'),
        description: error.response?.data?.error || error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to initiate OAuth flow
 */
export function useInitiateOAuth() {
  const { toast } = useToast();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (data?: { github_base_url?: string }) => {
      const response = await api.githubConnections.initiateOAuth(data);
      return response.data.data;
    },
    onSuccess: (data: { authorization_url: string; state: string }) => {
      // Redirect to GitHub authorization page
      window.location.href = data.authorization_url;
    },
    onError: (error: any) => {
      toast({
        title: t('gitSync:github.toasts.initiateFailed'),
        description: error.response?.data?.error || error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to connect via Personal Access Token
 */
export function useConnectWithPAT() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (data: { token: string; github_base_url?: string }) => {
      const response = await api.githubConnections.connectWithPAT(data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.githubConnections.all });
      toast({
        title: t('gitSync:github.toasts.connected'),
        description: t('gitSync:github.toasts.connectedDesc'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('gitSync:github.toasts.connectFailed'),
        description: error.response?.data?.error || error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to update a GitHub connection (set as default, update status)
 */
export function useUpdateGitHubConnection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: { is_default?: boolean; status?: string };
    }) => {
      const response = await api.githubConnections.update(id, data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.githubConnections.all });
      toast({
        title: t('gitSync:github.toasts.updated'),
        description: t('gitSync:github.toasts.updatedDesc'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('gitSync:github.toasts.updateFailed'),
        description: error.response?.data?.error || error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to delete a GitHub connection
 */
export function useDeleteGitHubConnection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await api.githubConnections.delete(id);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.githubConnections.all });
      toast({
        title: t('gitSync:github.toasts.removed'),
        description: t('gitSync:github.toasts.removedDesc'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('gitSync:github.toasts.removeFailed'),
        description: error.response?.data?.error || error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to fetch associations for a GitHub connection
 *
 * Task T037 (Phase 5 - User Story 3)
 */
export function useGitHubAssociations(
  connectionId: number | undefined,
  options?: { includeInactive?: boolean }
) {
  const { toast } = useToast();
  const { t } = useTranslation();

  return useQuery({
    queryKey: queryKeys.githubConnections.associations(connectionId, options),
    queryFn: async () => {
      if (!connectionId) return [];
      const response = await api.githubConnections.getAssociations(connectionId, options);
      return response.data as Array<{
        id: number;
        person_id: number;
        person_name: string;
        person_email: string;
        association_type: 'automatic' | 'manual';
        active: boolean;
        created_at: string;
      }>;
    },
    enabled: !!connectionId,
    onError: (error: any) => {
      toast({
        title: t('gitSync:github.toasts.assocLoadFailed'),
        description: error.response?.data?.error || error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to create a manual association between GitHub connection and person
 *
 * Task T035 (Phase 5 - User Story 3)
 */
export function useCreateGitHubAssociation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({
      connectionId,
      personId,
    }: {
      connectionId: number;
      personId: number;
    }) => {
      const response = await api.githubConnections.createAssociation(connectionId, {
        person_id: personId,
      });
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.githubConnections.all });
      toast({
        title: t('gitSync:github.toasts.assocCreated'),
        description: t('gitSync:github.toasts.assocCreatedDesc'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('gitSync:github.toasts.assocCreateFailed'),
        description: error.response?.data?.error || error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to remove an association between GitHub connection and person
 *
 * Task T036 (Phase 5 - User Story 3)
 */
export function useDeleteGitHubAssociation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({
      connectionId,
      personId,
    }: {
      connectionId: number;
      personId: number;
    }) => {
      const response = await api.githubConnections.deleteAssociation(connectionId, personId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.githubConnections.all });
      toast({
        title: t('gitSync:github.toasts.assocRemoved'),
        description: t('gitSync:github.toasts.assocRemovedDesc'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('gitSync:github.toasts.assocRemoveFailed'),
        description: error.response?.data?.error || error.message,
        variant: 'destructive',
      });
    },
  });
}

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
// GitHubConnection 统一走 api-responses 真身(2026-10-13 批清): 本文件原先
// 自带一份漂移副本(person_id 数字 vs 服务端字符串等),与全局类型打架
import type { GitHubConnection, GitHubAssociation } from '../types';

/**
 * Hook to fetch GitHub connections for the current user
 */
export function useGitHubConnections(options?: {
  includeInactive?: boolean;
  includeAssociations?: boolean;
}) {
  // 显式泛型 + 无 onError(2026-10-13 批清): v5 移除了 useQuery 级回调,
  // 原 onError 是永不触发的死代码且毒化 TData 推断(组件端 data 退化成 {})
  return useQuery<GitHubConnection[]>({
    queryKey: queryKeys.githubConnections.list(options),
    queryFn: async () => {
      // 服务端只认蛇形 query 参数——驼峰直传从未生效(过滤恒默认);
      // 返回体是裸数组(res.json(result),无信封),axios .data 即数组
      const response = await api.githubConnections.list({
        include_inactive: options?.includeInactive ? 'true' : undefined,
        include_associations: options?.includeAssociations ? 'true' : undefined,
      });
      return response.data;
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
  return useQuery({
    queryKey: queryKeys.githubConnections.detail(id, options),
    queryFn: async () => {
      if (!id) return null;
      const response = await api.githubConnections.get(id, {
        include_associations: options?.includeAssociations ? 'true' : undefined,
      });
      return response.data;
    },
    enabled: !!id,
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
      // 裸返回(res.json(result) 无信封)——原 .data.data 恒 undefined,
      // 授权跳转生来即坏(2026-10-13 批清)
      const response = await api.githubConnections.initiateOAuth(data);
      return response.data;
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
      // 裸返回(同 initiateOAuth)
      const response = await api.githubConnections.connectWithPAT(data);
      return response.data;
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
      // 裸返回(同 initiateOAuth)
      const response = await api.githubConnections.update(id, data);
      return response.data;
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
      // 裸返回(同 initiateOAuth)
      const response = await api.githubConnections.delete(id);
      return response.data;
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
  return useQuery<GitHubAssociation[]>({
    queryKey: queryKeys.githubConnections.associations(connectionId, options),
    queryFn: async () => {
      if (!connectionId) return [];
      // 蛇形参数映射 + 裸数组解包(同 list,2026-10-13 批清)
      const response = await api.githubConnections.getAssociations(connectionId, {
        include_inactive: options?.includeInactive ? 'true' : undefined,
      });
      return response.data;
    },
    enabled: !!connectionId,
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
      personId: string;
    }) => {
      // createAssociation 走 sendSuccess 信封 {success,data}——全文件唯一
      // 真双层解包点(其余端点均裸返回)
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
      personId: string;
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

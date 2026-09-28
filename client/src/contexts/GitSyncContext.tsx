/**
 * Git Sync Context for React state management
 * Feature: 001-git-sync-integration
 *
 * Manages sync status, pending changes, and sync operations
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SyncStatus, Conflict } from '../../../shared/types/git-entities';
import { api } from '../lib/api-client';

interface QueuedOperation {
  id: string;
  operation: 'push' | 'pull';
  data?: any;
}

interface GitSyncContextType {
  status: SyncStatus;
  pendingCount: number;
  conflicts: Conflict[];
  lastSyncAt: Date | null;
  isOnline: boolean;
  currentBranch: string;
  sync: () => Promise<void>;
  pull: () => Promise<void>;
  push: (commitMessage?: string) => Promise<void>;
  resolveConflict: (conflictId: string, resolution: 'accept_local' | 'accept_remote' | 'custom', customValue?: any) => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshConflicts: () => Promise<void>;
  switchBranch: (branchName: string) => Promise<void>;
  createBranch: (name: string, description: string) => Promise<void>;
  mergeBranch: (branchName: string) => Promise<void>;
}

const GitSyncContext = createContext<GitSyncContextType | null>(null);

interface GitSyncProviderProps {
  children: ReactNode;
}

export const GitSyncProvider: React.FC<GitSyncProviderProps> = ({ children }) => {
  // Cache freshness: staleTime is 5min and refetch-on-focus is disabled
  // (deliberate, ee02050), so invalidation is the only path to fresh data.
  // A pull applies remote changes to local tables — once it returns (clean
  // or conflicted), every cached list is potentially stale.
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SyncStatus>('synced');
  const [pendingCount, setPendingCount] = useState(0);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState<QueuedOperation[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>('main');

  // Load offline queue on mount
  useEffect(() => {
    const stored = localStorage.getItem('capacinator-offline-queue');
    if (stored) {
      try {
        setOfflineQueue(JSON.parse(stored));
      } catch (error) {
        console.error('Failed to load offline queue:', error);
      }
    }
  }, []);

  // Save offline queue to localStorage
  useEffect(() => {
    localStorage.setItem('capacinator-offline-queue', JSON.stringify(offlineQueue));
    setPendingCount(offlineQueue.length);
  }, [offlineQueue]);

  // Process offline queue when operations are added or modified
  const processOfflineQueue = async () => {
    if (!isOnline || offlineQueue.length === 0) return;

    setStatus('syncing');
    const queue = [...offlineQueue];

    for (const operation of queue) {
      try {
        if (operation.operation === 'push') {
          await api.sync.push(operation.data);
        } else if (operation.operation === 'pull') {
          await api.sync.pull();
        }

        // Remove processed operation
        setOfflineQueue((prev) => prev.filter((op) => op.id !== operation.id));
      } catch (error) {
        console.error('Queue processing failed:', error);
        setStatus('pending');
        return; // Stop processing on first failure
      }
    }

    setStatus('synced');
    setLastSyncAt(new Date());
  };

  // Monitor online/offline status and auto-retry when back online
  // Task: T043
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);

      // Process any queued operations
      if (offlineQueue.length > 0) {
        await processOfflineQueue();
      } else {
        setStatus((prev) => (prev === 'offline' ? 'synced' : prev));
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [offlineQueue]);

  const sync = async () => {
    if (!isOnline) {
      console.warn('Cannot sync while offline - queuing operation');
      setOfflineQueue((prev) => [
        ...prev,
        { id: `sync-${Date.now()}`, operation: 'push' },
        { id: `pull-${Date.now()}`, operation: 'pull' },
      ]);
      setStatus('pending');
      return;
    }

    setStatus('syncing');
    try {
      await api.sync.push();
      const pullResult = await api.sync.pull();
      // Remote changes may have landed locally — refresh every cache (see
      // the queryClient note at the top of the provider).
      queryClient.invalidateQueries();

      if (pullResult.data?.conflicts?.length > 0) {
        setConflicts(pullResult.data.conflicts);
        setStatus('conflict');
      } else {
        setStatus('synced');
      }

      setLastSyncAt(new Date());
    } catch (error) {
      console.error('Sync failed:', error);
      setStatus('pending');
    }
  };

  const pull = async () => {
    if (!isOnline) {
      console.warn('Cannot pull while offline - queuing operation');
      setOfflineQueue((prev) => [...prev, { id: `pull-${Date.now()}`, operation: 'pull' }]);
      setStatus('pending');
      return;
    }

    setStatus('syncing');
    try {
      const result = await api.sync.pull();
      // Remote changes may have landed locally — refresh every cache (see
      // the queryClient note at the top of the provider). Applies before
      // conflict branching: a conflicted pull may still have applied part
      // of the remote data.
      queryClient.invalidateQueries();

      // Check for conflicts (Task: T058)
      if (result.data?.conflicts?.length > 0) {
        setConflicts(result.data.conflicts);
        setStatus('conflict');
        // Conflict resolution UI will be triggered by status change
      } else {
        setStatus('synced');
        setConflicts([]);
      }

      setLastSyncAt(new Date());
    } catch (error) {
      console.error('Pull failed:', error);
      setStatus('synced');
    }
  };

  const push = async (commitMessage?: string) => {
    if (!isOnline) {
      console.warn('Cannot push while offline - queuing operation');
      setOfflineQueue((prev) => [
        ...prev,
        { id: `push-${Date.now()}`, operation: 'push', data: { commitMessage } },
      ]);
      setStatus('pending');
      return;
    }

    setStatus('syncing');
    try {
      await api.sync.push({ commitMessage });

      setStatus('synced');
      setLastSyncAt(new Date());
    } catch (error) {
      console.error('Push failed:', error);
      setStatus('pending');
    }
  };

  const resolveConflict = async (
    conflictId: string,
    resolution: 'accept_local' | 'accept_remote' | 'custom',
    customValue?: any
  ) => {
    try {
      await api.sync.resolveConflict(conflictId, resolution, customValue);

      // Remove resolved conflict from state
      setConflicts((prev) => prev.filter((c) => c.id !== conflictId));

      // If no more conflicts, change status
      if (conflicts.length === 1) {
        setStatus('synced');
      }
    } catch (error) {
      console.error('Conflict resolution failed:', error);
      throw error;
    }
  };

  const refreshStatus = async () => {
    try {
      const result = await api.sync.getStatus();

      if (result.data) {
        // Map backend status to frontend SyncStatus type
        const backendStatus = result.data.status;
        if (backendStatus === 'not-initialized') {
          setStatus('offline');
        } else if (backendStatus === 'behind') {
          setStatus('pending');
        } else if (['synced', 'pending'].includes(backendStatus)) {
          setStatus(backendStatus);
        }

        // Update pending count and conflicts
        setPendingCount(result.data.pendingChangesCount || offlineQueue.length);

        // Get conflicts if any
        if (result.data.conflictsCount > 0) {
          const conflictsResult = await api.sync.getConflicts();
          setConflicts(conflictsResult.data?.data || []);
          setStatus('conflict');
        }
      }
    } catch (error) {
      console.error('Status refresh failed:', error);
    }
  };

  /**
   * Refresh conflicts from server
   * Task: T057
   */
  const refreshConflicts = async () => {
    try {
      const result = await api.sync.getConflicts();
      if (result.data) {
        setConflicts(result.data || []);
        if (result.data.length > 0) {
          setStatus('conflict');
        } else if (status === 'conflict') {
          setStatus('synced');
        }
      }
    } catch (error) {
      console.error('Failed to refresh conflicts:', error);
    }
  };

  /**
   * Switch to a different branch
   * Task: T088, T089
   */
  const switchBranch = async (branchName: string) => {
    try {
      setStatus('syncing');
      await api.sync.checkoutBranch(branchName);
      setCurrentBranch(branchName);

      // Notify Electron to rebuild cache if running in Electron (Task: T089)
      if ((window as any).electronAPI?.gitBranchSwitched) {
        await (window as any).electronAPI.gitBranchSwitched(branchName);
      }

      setStatus('synced');

      // Refresh page to reload data from new branch
      window.location.reload();
    } catch (error) {
      console.error('Failed to switch branch:', error);
      setStatus('synced');
      throw error;
    }
  };

  /**
   * Create a new branch
   * Task: T088
   */
  const createBranch = async (name: string, description: string) => {
    try {
      await api.sync.createBranch({ name, description });
      await switchBranch(name);
    } catch (error) {
      console.error('Failed to create branch:', error);
      throw error;
    }
  };

  /**
   * Merge a branch into current branch
   * Task: T090
   */
  const mergeBranch = async (branchName: string) => {
    try {
      setStatus('syncing');
      const result = await api.sync.mergeBranch(branchName);

      if (result.data?.conflicts && result.data.conflicts.length > 0) {
        // Merge has conflicts - show them for resolution
        setConflicts(result.data.conflicts);
        setStatus('conflict');
      } else {
        setStatus('synced');
        // Refresh page to show merged data
        window.location.reload();
      }
    } catch (error) {
      console.error('Failed to merge branch:', error);
      setStatus('synced');
      throw error;
    }
  };

  const value: GitSyncContextType = {
    status,
    pendingCount,
    conflicts,
    lastSyncAt,
    isOnline,
    currentBranch,
    sync,
    pull,
    push,
    resolveConflict,
    refreshStatus,
    refreshConflicts,
    switchBranch,
    createBranch,
    mergeBranch,
  };

  return <GitSyncContext.Provider value={value}>{children}</GitSyncContext.Provider>;
};

export const useGitSync = () => {
  const context = useContext(GitSyncContext);
  if (!context) {
    throw new Error('useGitSync must be used within GitSyncProvider');
  }
  return context;
};

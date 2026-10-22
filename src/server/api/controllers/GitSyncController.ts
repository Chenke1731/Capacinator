/**
 * Git Sync Controller for sync operations
 * Feature: 001-git-sync-integration
 *
 * Handles API endpoints for Git sync, pull, push, status
 */

import type { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import { GitRepositoryService } from '../../services/git/GitRepositoryService.js';
import { ScenarioExporter } from '../../services/git/ScenarioExporter.js';
import { GitAuthService } from '../../services/git/GitAuthService.js';
import { logger } from '../../services/logging/config.js';
import {
  GitError,
  GitNetworkError,
  GitAuthenticationError,
  GitPermissionError,
  GitConflictError,
  GitRepositoryStateError,
  GitBranchError,
  GitCloneError,
  GitPushError,
  GitDiskSpaceError,
} from '../../services/git/GitErrors.js';
import path from 'path';
import os from 'os';

export class GitSyncController extends BaseController {
  private gitService: GitRepositoryService;
  private exporter: ScenarioExporter;
  private authService: GitAuthService;
  private repoPath: string;

  constructor() {
    super({ enableLogging: true });

    // Get repository path from environment or use userData directory
    this.repoPath = process.env.GIT_REPO_PATH || path.join(os.homedir(), '.capacinator', 'git-repo');

    this.gitService = new GitRepositoryService(this.repoPath);
    this.exporter = new ScenarioExporter(this.db, this.repoPath);
    this.authService = new GitAuthService();
  }

  /**
   * GET /api/sync/status
   * Task: T026
   *
   * Check current sync status
   */
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const exists = await this.gitService.repositoryExists();

      if (!exists) {
        res.json({
          success: true,
          data: {
            status: 'not-initialized',
            pendingChangesCount: 0,
            lastSyncAt: null,
            conflictsCount: 0,
            repositoryUrl: process.env.GIT_REPOSITORY_URL || null,
          },
        });
      }

      await this.gitService.getStatus();
      const isClean = await this.gitService.isClean();
      const commitsAhead = await this.gitService.getCommitsAhead();
      const commitsBehind = await this.gitService.getCommitsBehind();

      res.json({
        success: true,
        data: {
          status: !isClean ? 'pending' : commitsAhead > 0 ? 'pending' : commitsBehind > 0 ? 'behind' : 'synced',
          pendingChangesCount: commitsAhead,
          lastSyncAt: null, // TODO: Track last sync timestamp
          conflictsCount: 0, // TODO: Count unresolved conflicts from database
          repositoryUrl: await this.gitService.getRemoteUrl(),
          currentBranch: await this.gitService.getCurrentBranch(),
          commitsBehind,
          commitsAhead,
        },
      });
    } catch (error) {
      this.handleGitError(error, req, res, 'Failed to get sync status');
    }
  }

  /**
   * POST /api/sync/pull
   * Task: T027, T053
   *
   * Pull updates from remote repository and detect conflicts
   */
  async pull(req: Request, res: Response): Promise<void> {
    try {
      // Check if repository exists
      const exists = await this.gitService.repositoryExists();
      if (!exists) {
        res.status(400).json({
          success: false,
          error: {
            code: 'REPOSITORY_NOT_INITIALIZED',
            message: 'Repository not initialized. Initialize first.',
          },
        });
      }

      // Create sync operation record
      const syncOperationId = `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await this.db('sync_operations').insert({
        id: syncOperationId,
        type: 'pull',
        status: 'in-progress',
        started_at: new Date().toISOString(),
        user_id: req.user?.id || null,
      });

      try {
        // Pull from remote
        const result = await this.gitService.pull();

        if (result.success) {
          // Detect data-level conflicts (T053)
          const dataConflicts = await this.exporter.detectConflictsAfterPull('working', syncOperationId);

          if (dataConflicts.length > 0) {
            // Store conflicts in database
            for (const conflict of dataConflicts) {
              await this.db('conflicts').insert({
                id: conflict.id,
                sync_operation_id: syncOperationId,
                entity_type: conflict.entityType,
                entity_id: conflict.entityId,
                entity_name: conflict.entityName,
                field: conflict.field,
                base_value: conflict.baseValue,
                local_value: conflict.localValue,
                remote_value: conflict.remoteValue,
                resolution_status: 'pending',
              });
            }

            // Update sync operation status
            await this.db('sync_operations')
              .where('id', syncOperationId)
              .update({
                status: 'conflict',
                conflict_count: dataConflicts.length,
                completed_at: new Date().toISOString(),
              });

            // Return conflicts for user resolution (T053)
            res.json({
              success: false,
              data: {
                filesChanged: result.filesChanged,
                conflictsDetected: dataConflicts.length,
                conflicts: dataConflicts,
              },
            });
          }

          // No conflicts, import the data (T097: with partial recovery)
          const importResult = await this.exporter.importFromJSON('working');

          // Update sync operation status
          // 047 真身枚举五态(pending/in-progress/completed/failed/conflict)——
          // 无 'completed-with-errors'(手写测试库时代曾掩盖此错:真库必炸)。
          // 部分成功仍属 completed,警告落 error_message(客户端无第六态消费)。
          await this.db('sync_operations')
            .where('id', syncOperationId)
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              ...(importResult.errors.length > 0
                ? { error_message: `Import warnings: ${importResult.errors.join('; ')}` }
                : {}),
            });

          // Include import warnings if any records were skipped
          if (importResult.errors.length > 0) {
            console.warn('Import completed with warnings:', importResult.errors);
          }

          res.json({
            success: result.success,
            data: {
              filesChanged: result.filesChanged,
              conflictsDetected: 0,
              conflicts: [],
              imported: importResult.imported,
              warnings: importResult.errors,
            },
          });
        }

        res.json({
          success: result.success,
          data: {
            filesChanged: result.filesChanged,
            conflictsDetected: 0,
            conflicts: [],
          },
        });
      } catch (pullError) {
        // Update sync operation to failed
        await this.db('sync_operations')
          .where('id', syncOperationId)
          .update({
            status: 'failed',
            error_message: (pullError as Error).message,
            completed_at: new Date().toISOString(),
          });
        throw pullError;
      }
    } catch (error) {
      this.handleGitError(error, req, res, 'Failed to pull updates');
    }
  }

  /**
   * POST /api/sync/push
   * Task: T028
   *
   * Push local changes to remote repository
   */
  async push(req: Request, res: Response): Promise<void> {
    try {
      const { commitMessage } = req.body;

      // Check if repository exists
      const exists = await this.gitService.repositoryExists();
      if (!exists) {
        res.status(400).json({
          success: false,
          error: {
            code: 'REPOSITORY_NOT_INITIALIZED',
            message: 'Repository not initialized. Initialize first.',
          },
        });
      }

      // Check for Git credentials
      if (!req.gitCredentials) {
        res.status(401).json({
          success: false,
          error: {
            code: 'GIT_AUTH_REQUIRED',
            message: 'GitHub authentication required',
          },
        });
        return;
      }

      // Check for unresolved conflicts (Task: T062)
      const unresolvedConflicts = await this.db('conflicts')
        .where('resolution_status', 'pending')
        .count('* as count')
        .first();

      if (unresolvedConflicts && unresolvedConflicts.count > 0) {
        res.status(409).json({
          success: false,
          error: {
            code: 'UNRESOLVED_CONFLICTS',
            message: `Cannot push with ${unresolvedConflicts.count} unresolved conflict(s). Please resolve conflicts first.`,
            conflictCount: unresolvedConflicts.count,
          },
        });
      }

      // Export SQLite to JSON
      await this.exporter.exportToJSON('working');

      // Generate commit message if not provided
      const message = commitMessage || (await this.exporter.generateCommitMessage('working'));

      // Get author from authenticated user
      const author = {
        name: req.user?.name || 'Capacinator User',
        email: req.user?.email || 'user@example.com',
      };

      // Commit
      const commitSha = await this.gitService.commit(message, author);

      // Push
      const credentials = {
        userId: req.user?.id || '',
        provider: 'github-enterprise' as const,
        credentialType: 'personal-access-token' as const,
        token: req.gitCredentials.token,
        repositoryUrl: req.gitCredentials.repositoryUrl,
        createdAt: new Date(),
      };

      // Get current branch and push to it (Task: T092)
      const currentBranch = await this.gitService.getCurrentBranch();
      await this.gitService.push(credentials, currentBranch);

      // Clear resolved conflicts after successful push (Task: T064)
      await this.db('conflicts')
        .where('resolution_status', 'resolved')
        .del();

      res.json({
        success: true,
        data: {
          commitSha,
          filesChanged: 4, // projects, people, assignments, phases
          commitMessage: message,
        },
      });
    } catch (error) {
      this.handleGitError(error, req, res, 'Failed to push changes');
    }
  }

  /**
   * GET /api/sync/conflicts
   * Task: T051
   *
   * Get list of unresolved conflicts
   */
  async getConflicts(req: Request, res: Response): Promise<void> {
    try {
      const conflicts = await this.db('conflicts')
        .where('resolution_status', 'pending')
        .orderBy('created_at', 'desc');

      res.json({
        success: true,
        data: conflicts.map((c: any) => ({
          id: c.id,
          syncOperationId: c.sync_operation_id,
          entityType: c.entity_type,
          entityId: c.entity_id,
          entityName: c.entity_name,
          field: c.field,
          baseValue: c.base_value,
          localValue: c.local_value,
          remoteValue: c.remote_value,
          resolutionStatus: c.resolution_status,
          resolvedValue: c.resolved_value,
          resolvedAt: c.resolved_at,
          resolvedBy: c.resolved_by,
        })),
      });
    } catch (error) {
      this.handleGitError(error, req, res, 'Failed to get conflicts');
    }
  }

  /**
   * POST /api/sync/conflicts/:id/resolve
   * Task: T052, T054
   *
   * Resolve a conflict with user's chosen resolution
   */
  async resolveConflict(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { resolution, customValue } = req.body;

      // Validate resolution type (T054)
      if (!['accept_local', 'accept_remote', 'custom'].includes(resolution)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_RESOLUTION',
            message: 'Resolution must be one of: accept_local, accept_remote, custom',
          },
        });
      }

      if (resolution === 'custom' && customValue === undefined) {
        res.status(400).json({
          success: false,
          error: {
            code: 'CUSTOM_VALUE_REQUIRED',
            message: 'customValue is required when resolution is "custom"',
          },
        });
      }

      // Get the conflict
      const conflict = await this.db('conflicts')
        .where('id', id)
        .first();

      if (!conflict) {
        return this.handleNotFound(req, res, 'Conflict not found');
      }

      // Import GitConflictResolver
      const { GitConflictResolver } = await import('../../services/git/GitConflictResolver.js');
      const resolver = new GitConflictResolver();

      // Apply resolution
      const resolvedValue = resolver.applyResolution(
        {
          id: conflict.id,
          syncOperationId: conflict.sync_operation_id,
          entityType: conflict.entity_type,
          entityId: conflict.entity_id,
          entityName: conflict.entity_name,
          field: conflict.field,
          baseValue: conflict.base_value,
          localValue: conflict.local_value,
          remoteValue: conflict.remote_value,
          resolutionStatus: conflict.resolution_status,
        },
        resolution,
        customValue
      );

      // Update the conflict status
      await this.db('conflicts')
        .where('id', id)
        .update({
          resolution_status: 'resolved',
          resolved_value: typeof resolvedValue === 'object' ? JSON.stringify(resolvedValue) : resolvedValue,
          resolved_at: new Date().toISOString(),
          resolved_by: req.user?.email || 'Unknown',
        });

      // Apply the resolved value to the actual entity
      const tableName = this.getTableNameForEntityType(conflict.entity_type);
      if (tableName) {
        await this.db(tableName)
          .where('id', conflict.entity_id)
          .update({
            [conflict.field]: resolvedValue,
            updated_at: new Date().toISOString(),
          });
      }

      res.json({
        success: true,
        data: {
          conflictId: id,
          resolution,
          resolvedValue,
        },
      });
    } catch (error) {
      this.handleGitError(error, req, res, 'Failed to resolve conflict');
    }
  }

  /**
   * Helper: Map entity type to table name
   */
  private getTableNameForEntityType(entityType: string): string | null {
    const mapping: Record<string, string> = {
      project: 'projects',
      person: 'people',
      assignment: 'project_assignments',
      project_phase: 'project_phases',
    };
    return mapping[entityType] || null;
  }

  /**
   * POST /api/sync/branches
   * Task: T073
   *
   * Create a new scenario branch
   */
  async createBranch(req: Request, res: Response): Promise<void> {
    try {
      const { name, description, baseBranch } = req.body;

      if (!name) {
        return this.handleValidationError(req, res, 'Branch name is required');
      }

      // Create Git branch
      await this.gitService.createBranch(name, baseBranch || 'main');

      // Create branch metadata
      const { BranchMetadataService } = await import('../../services/git/BranchMetadataService.js');
      const metadataService = new BranchMetadataService(this.repoPath);

      const metadata = await metadataService.createBranchMetadata(
        name,
        description || '',
        req.user?.email || 'Unknown',
        baseBranch || 'main'
      );

      res.json({
        success: true,
        data: metadata,
      });
    } catch (error) {
      this.handleGitError(error, req, res, 'Failed to create branch');
    }
  }

  /**
   * GET /api/sync/branches
   * Task: T074
   *
   * List all scenario branches
   */
  async listBranches(req: Request, res: Response): Promise<void> {
    try {
      // Get Git branches
      const gitBranches = await this.gitService.listBranches();

      // Get branch metadata
      const { BranchMetadataService } = await import('../../services/git/BranchMetadataService.js');
      const metadataService = new BranchMetadataService(this.repoPath);
      const metadata = await metadataService.getAllBranches();

      // Combine Git branches with metadata
      const branches = gitBranches.map((branchName) => {
        const meta = metadata.find((m) => m.name === branchName);
        return {
          name: branchName,
          description: meta?.description || '',
          createdAt: meta?.createdAt || null,
          createdBy: meta?.createdBy || null,
          baseBranch: meta?.baseBranch || 'main',
          isActive: meta?.isActive ?? true,
        };
      });

      res.json({
        success: true,
        data: branches,
      });
    } catch (error) {
      this.handleGitError(error, req, res, 'Failed to list branches');
    }
  }

  /**
   * POST /api/sync/branches/:name/checkout
   * Task: T075
   *
   * Switch to a different scenario branch
   */
  async checkoutBranch(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;

      // Checkout the branch
      await this.gitService.checkoutBranch(name);

      // Rebuild SQLite cache from this branch's JSON (T097: with partial recovery)
      const importResult = await this.exporter.importFromJSON(name === 'main' ? 'working' : name);

      res.json({
        success: true,
        data: {
          currentBranch: name,
          imported: importResult.imported,
          warnings: importResult.errors,
        },
      });
    } catch (error) {
      this.handleGitError(error, req, res, 'Failed to checkout branch');
    }
  }

  /**
   * POST /api/sync/branches/:name/merge
   * Task: T076
   *
   * Merge a branch into the current branch
   */
  async mergeBranch(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;

      // Perform merge
      const result = await this.gitService.mergeBranch(name);

      if (!result.success) {
        // Detect conflicts
        const syncOperationId = `merge-${Date.now()}`;
        const conflicts = await this.exporter.detectConflictsAfterPull('working', syncOperationId);

        // Store conflicts
        for (const conflict of conflicts) {
          await this.db('conflicts').insert({
            id: conflict.id,
            sync_operation_id: syncOperationId,
            entity_type: conflict.entityType,
            entity_id: conflict.entityId,
            entity_name: conflict.entityName,
            field: conflict.field,
            base_value: conflict.baseValue,
            local_value: conflict.localValue,
            remote_value: conflict.remoteValue,
            resolution_status: 'pending',
          });
        }

        res.json({
          success: false,
          data: {
            conflicts,
            conflictCount: conflicts.length,
          },
        });
      }

      // Rebuild cache after successful merge
      await this.exporter.importFromJSON('working');

      res.json({
        success: true,
        data: {
          merged: true,
        },
      });
    } catch (error) {
      this.handleGitError(error, req, res, 'Failed to merge branch');
    }
  }

  /**
   * GET /api/sync/history
   * Task: T077
   *
   * Get commit history with optional filtering
   */
  async getHistory(req: Request, res: Response): Promise<void> {
    try {
      const { limit, entityType, entityId } = req.query;

      const options = {
        maxCount: limit ? parseInt(limit as string, 10) : 50,
      };

      const commits = await this.gitService.getHistory(options);

      // If filtering by entity, parse commit history
      if (entityType && entityId) {
        const { ChangeHistoryParser } = await import('../../services/git/ChangeHistoryParser.js');
        const parser = new ChangeHistoryParser(this.db);

        const entityHistory = await parser.getEntityHistory(
          entityType as any,
          entityId as string,
          commits
        );

        res.json({
          success: true,
          data: entityHistory,
        });
      }

      // Return raw commits
      res.json({
        success: true,
        data: commits,
      });
    } catch (error) {
      this.handleGitError(error, req, res, 'Failed to get history');
    }
  }

  /**
   * GET /api/sync/compare
   * Task: T078
   *
   * Compare two branches
   */
  async compareBranches(req: Request, res: Response): Promise<void> {
    try {
      const { base, target } = req.query;

      if (!base || !target) {
        return this.handleValidationError(req, res, 'Both base and target branches are required');
      }

      const { ScenarioComparator } = await import('../../services/git/ScenarioComparator.js');
      const comparator = new ScenarioComparator(this.repoPath);

      const comparison = await comparator.compareBranches(base as string, target as string);

      res.json({
        success: true,
        data: comparison,
      });
    } catch (error) {
      this.handleGitError(error, req, res, 'Failed to compare branches');
    }
  }

  /**
   * Handle Git-specific errors with user-friendly messages
   * Task: T093
   *
   * @param error - Error object (may be GitError or generic Error)
   * @param req - Express request
   * @param res - Express response
   * @param defaultMessage - Default error message if not a GitError
   */
  private handleGitError(error: any, req: Request, res: Response, defaultMessage: string): void {
    // If it's a GitError, use the user-friendly message
    if (error instanceof GitError) {
      const statusCode = this.getStatusCodeForGitError(error);

      res.status(statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.userMessage,
          technicalDetails: error.message,
          recoverable: error.recoverable,
        },
      });

      // Log for debugging
      if (error instanceof GitNetworkError || error instanceof GitAuthenticationError) {
        logger?.warn(`Git operation failed: ${error.code}`, {
          error: error.message,
          userId: req.user?.id,
          operation: defaultMessage,
        });
      } else {
        logger?.error(`Git operation failed: ${error.code}`, error, {
          userId: req.user?.id,
          operation: defaultMessage,
        });
      }

      return;
    }

    // Fall back to standard error handling
    this.handleError(error, req, res, defaultMessage);
  }

  /**
   * Map GitError types to HTTP status codes
   */
  private getStatusCodeForGitError(error: GitError): number {
    if (error instanceof GitAuthenticationError) return 401;
    if (error instanceof GitPermissionError) return 403;
    if (error instanceof GitConflictError) return 409;
    if (error instanceof GitBranchError) return 400;
    if (error instanceof GitRepositoryStateError) return 400;
    if (error instanceof GitDiskSpaceError) return 507; // Insufficient Storage
    if (error instanceof GitNetworkError) return 503; // Service Unavailable
    if (error instanceof GitPushError) return 409; // Conflict
    if (error instanceof GitCloneError) return 500;

    return 500; // Internal Server Error for unknown Git errors
  }
}

import type { Response } from 'express';
import { BaseController, RequestWithContext } from './BaseController.js';
import { getGitHubConnectionService } from '../../services/GitHubConnectionService.js';
import { getGitHubAssociationService } from '../../services/GitHubAssociationService.js';
import { getGitHubOAuthService } from '../../services/GitHubOAuthService.js';
import type { RequestWithOAuthState } from '../../middleware/github-oauth-state.js';

/**
 * GitHubConnectionController
 *
 * Handles GitHub authentication and connection management endpoints.
 *
 * Phase 2 (Foundational): Basic CRUD structure
 * Phase 3 (User Story 1): OAuth flow implementation (T016-T019)
 * Phase 4 (User Story 2): PAT connection implementation (T026-T032)
 */
export class GitHubConnectionController extends BaseController {
  // Lazy initialization of services to allow dotenv to load first
  private _connectionService: ReturnType<typeof getGitHubConnectionService> | null = null;
  private _associationService: ReturnType<typeof getGitHubAssociationService> | null = null;
  private _oauthService: ReturnType<typeof getGitHubOAuthService> | null = null;

  private get connectionService() {
    if (!this._connectionService) {
      this._connectionService = getGitHubConnectionService();
    }
    return this._connectionService;
  }

  private get associationService() {
    if (!this._associationService) {
      this._associationService = getGitHubAssociationService();
    }
    return this._associationService;
  }

  private get oauthService() {
    if (!this._oauthService) {
      this._oauthService = getGitHubOAuthService();
    }
    return this._oauthService;
  }

  constructor() {
    super({ enableLogging: true, enableAudit: true });
  }

  /**
   * GET /api/github-connections
   * List all GitHub connections for the authenticated user
   */
  listConnections = this.asyncHandler(
    async (req: RequestWithContext, res: Response) => {
      if (!req.user?.id) {
        return this.sendError(req, res, 'Unauthorized', 401);
      }

      const result = await this.executeQuery(
        async () => {
          const includeInactive = req.query.include_inactive === 'true';
          const connections = await this.connectionService.findByUserId(
            parseInt(req.user!.id, 10),
            includeInactive
          );

          // Optionally include associations
          if (req.query.include_associations === 'true') {
            const connectionsWithAssociations = await Promise.all(
              connections.map(async (connection) => {
                const associations =
                  await this.associationService.findByConnectionId(
                    connection.id
                  );
                return { ...connection, associations };
              })
            );
            return connectionsWithAssociations;
          }

          return connections;
        },
        req,
        res,
        'Failed to fetch GitHub connections'
      );

      if (result) {
        this.sendSuccess(req, res, result);
      }
    }
  );

  /**
   * GET /api/github-connections/:id
   * Get a specific GitHub connection by ID
   */
  getConnection = this.asyncHandler(
    async (req: RequestWithContext, res: Response) => {
      if (!req.user?.id) {
        return this.sendError(req, res, 'Unauthorized', 401);
      }

      const { id } = req.params;
      const connectionId = parseInt(id, 10);

      if (isNaN(connectionId)) {
        return this.handleValidationError(req, res, {
          id: 'Invalid connection ID',
        });
      }

      const result = await this.executeQuery(
        async () => {
          const connection = await this.connectionService.findById(
            connectionId
          );

          if (!connection) {
            this.handleNotFound(req, res, 'GitHub connection');
            return null;
          }

          // Verify ownership
          if (connection.user_id !== parseInt(req.user!.id, 10)) {
            this.sendError(req, res, 'Forbidden', 403);
            return null;
          }

          // Include associations if requested
          if (req.query.include_associations === 'true') {
            const associations =
              await this.associationService.findByConnectionId(connection.id);
            return { ...connection, associations };
          }

          return connection;
        },
        req,
        res,
        'Failed to fetch GitHub connection'
      );

      if (result) {
        res.json(result);
      }
    }
  );

  /**
   * DELETE /api/github-connections/:id
   * Delete a GitHub connection
   */
  deleteConnection = this.asyncHandler(
    async (req: RequestWithContext, res: Response) => {
      if (!req.user?.id) {
        return this.sendError(req, res, 'Unauthorized', 401);
      }

      const { id } = req.params;
      const connectionId = parseInt(id, 10);

      if (isNaN(connectionId)) {
        return this.handleValidationError(req, res, {
          id: 'Invalid connection ID',
        });
      }

      const result = await this.executeQuery(
        async () => {
          // Verify connection exists and user owns it
          const connection = await this.connectionService.findById(
            connectionId
          );

          if (!connection) {
            this.handleNotFound(req, res, 'GitHub connection');
            return null;
          }

          if (connection.user_id !== parseInt(req.user!.id, 10)) {
            this.sendError(req, res, 'Forbidden', 403);
            return null;
          }

          // Delete the connection (cascade will delete associations)
          const deleted = await this.connectionService.delete(connectionId);

          if (!deleted) {
            throw new Error('Failed to delete connection');
          }

          this.logBusinessOperation(
            req,
            'DELETE',
            'github_connection',
            connectionId.toString(),
            {
              github_username: connection.github_username,
              connection_method: connection.connection_method,
            }
          );

          return { deleted: true, id: connectionId };
        },
        req,
        res,
        'Failed to delete GitHub connection'
      );

      if (result) {
        this.sendSuccess(req, res, result, 'Connection deleted successfully');
      }
    }
  );

  /**
   * PATCH /api/github-connections/:id
   * Update a GitHub connection (set as default, update status, etc.)
   */
  updateConnection = this.asyncHandler(
    async (req: RequestWithContext, res: Response) => {
      if (!req.user?.id) {
        return this.sendError(req, res, 'Unauthorized', 401);
      }

      const { id } = req.params;
      const connectionId = parseInt(id, 10);

      if (isNaN(connectionId)) {
        return this.handleValidationError(req, res, {
          id: 'Invalid connection ID',
        });
      }

      const result = await this.executeQuery(
        async () => {
          // Verify connection exists and user owns it
          const connection = await this.connectionService.findById(
            connectionId
          );

          if (!connection) {
            this.handleNotFound(req, res, 'GitHub connection');
            return null;
          }

          if (connection.user_id !== parseInt(req.user!.id, 10)) {
            this.sendError(req, res, 'Forbidden', 403);
            return null;
          }

          // Handle setting as default
          if (req.body.is_default === true) {
            const updated = await this.connectionService.setAsDefault(
              connectionId
            );
            this.logBusinessOperation(
              req,
              'UPDATE',
              'github_connection',
              connectionId.toString(),
              { action: 'set_as_default' }
            );
            return updated;
          }

          // Handle other updates (status, etc.)
          const updates: any = {};
          if (req.body.status) {
            updates.status = req.body.status;
          }

          const updated = await this.connectionService.update(
            connectionId,
            updates
          );

          this.logBusinessOperation(
            req,
            'UPDATE',
            'github_connection',
            connectionId.toString(),
            { updates }
          );

          return updated;
        },
        req,
        res,
        'Failed to update GitHub connection'
      );

      if (result) {
        this.sendSuccess(req, res, result, 'Connection updated successfully');
      }
    }
  );

  /**
   * GET /api/github-connections/:id/associations
   * Get all associations for a GitHub connection
   */
  getAssociations = this.asyncHandler(
    async (req: RequestWithContext, res: Response) => {
      if (!req.user?.id) {
        return this.sendError(req, res, 'Unauthorized', 401);
      }

      const { id } = req.params;
      const connectionId = parseInt(id, 10);

      if (isNaN(connectionId)) {
        return this.handleValidationError(req, res, {
          id: 'Invalid connection ID',
        });
      }

      const result = await this.executeQuery(
        async () => {
          // Verify connection exists and user owns it
          const connection = await this.connectionService.findById(
            connectionId
          );

          if (!connection) {
            this.handleNotFound(req, res, 'GitHub connection');
            return null;
          }

          if (connection.user_id !== parseInt(req.user!.id, 10)) {
            this.sendError(req, res, 'Forbidden', 403);
            return null;
          }

          const includeInactive = req.query.include_inactive === 'true';
          const associations =
            await this.associationService.findByConnectionId(
              connectionId,
              includeInactive
            );

          return associations;
        },
        req,
        res,
        'Failed to fetch associations'
      );

      if (result) {
        res.json(result);
      }
    }
  );

  /**
   * POST /api/github-connections/oauth/authorize
   * Initiate OAuth authorization flow
   *
   * Task T016 (Phase 3 - User Story 1)
   */
  initiateOAuth = this.asyncHandler(
    async (req: RequestWithContext, res: Response) => {
      if (!req.user?.id) {
        return this.sendError(req, res, 'Unauthorized', 401);
      }

      const result = await this.executeQuery(
        async () => {
          const userId = parseInt(req.user!.id, 10);
          const githubBaseUrl = req.body.github_base_url;

          // Generate OAuth state and authorization URL
          const authResponse = this.oauthService.initiateOAuth(
            userId,
            githubBaseUrl
          );

          this.logBusinessOperation(
            req,
            'INITIATE_OAUTH',
            'github_connection',
            authResponse.state,
            {
              userId,
              githubBaseUrl: githubBaseUrl || 'https://github.com',
            }
          );

          return authResponse;
        },
        req,
        res,
        'Failed to initiate OAuth flow'
      );

      if (result) {
        this.sendSuccess(req, res, result, 'OAuth flow initiated');
      }
    }
  );

  /**
   * GET /api/github-connections/oauth/callback
   * Handle OAuth callback from GitHub
   *
   * Task T017 (Phase 3 - User Story 1)
   *
   * Note: This endpoint uses validateOAuthState middleware
   * which attaches req.oauthState to the request
   */
  handleOAuthCallback = this.asyncHandler(
    async (req: RequestWithContext, res: Response) => {
      const reqWithState = req as RequestWithOAuthState;
      const { code } = req.query;

      if (!code || typeof code !== 'string') {
        return this.sendError(
          req,
          res,
          'Missing authorization code',
          400
        );
      }

      const result = await this.executeQuery(
        async () => {
          const { oauthState } = reqWithState;

          // Exchange code for access token
          const tokenData = await this.oauthService.exchangeCodeForToken(
            code,
            oauthState.state
          );

          // Consume the state token (one-time use)
          this.oauthService.consumeState(oauthState.state);

          // Parse scopes
          const scopes = tokenData.scope ? tokenData.scope.split(',') : [];

          // Fetch GitHub user info
          const githubUser = await this.oauthService.fetchUserInfo(
            tokenData.access_token,
            oauthState.github_base_url
          );

          // Fetch GitHub emails for association matching
          const githubEmails = await this.oauthService.fetchUserEmails(
            tokenData.access_token,
            oauthState.github_base_url
          );

          // Create connection record (Task T018)
          const connection = await this.connectionService.createFromOAuth(
            oauthState.user_id,
            githubUser,
            tokenData.access_token,
            scopes,
            tokenData.refresh_token,
            tokenData.expires_in,
            oauthState.github_base_url
          );

          // Create automatic email-based associations (Task T019)
          const verifiedEmails = githubEmails
            .filter((e) => e.verified)
            .map((e) => e.email);

          const associations =
            await this.associationService.createAutomaticAssociations(
              connection.id,
              verifiedEmails,
              githubUser.id,
              githubUser.login
            );

          this.logBusinessOperation(
            req,
            'OAUTH_CONNECTED',
            'github_connection',
            connection.id.toString(),
            {
              githubUserId: githubUser.id,
              githubUsername: githubUser.login,
              associationsCreated: associations.length,
              scopes,
            }
          );

          return {
            connection,
            associations_created: associations.length,
          };
        },
        req,
        res,
        'Failed to complete OAuth connection'
      );

      if (result) {
        // For browser-based flow, redirect to success page
        // Frontend will handle this redirect and display the result
        res.redirect(
          `/settings/github?success=true&connection_id=${result.connection.id}&associations=${result.associations_created}`
        );
      }
    }
  );

  /**
   * POST /api/github-connections/pat
   * Connect GitHub using Personal Access Token
   *
   * Task T028 (Phase 4 - User Story 2)
   */
  connectWithPAT = this.asyncHandler(
    async (req: RequestWithContext, res: Response) => {
      if (!req.user?.id) {
        return this.sendError(req, res, 'Unauthorized', 401);
      }

      const { token, github_base_url } = req.body;

      if (!token || typeof token !== 'string') {
        return this.handleValidationError(req, res, {
          token: 'Token is required',
        });
      }

      const result = await this.executeQuery(
        async () => {
          const userId = parseInt(req.user!.id, 10);

          // Create connection from PAT (includes validation)
          const createResult = await this.connectionService.createFromPAT(
            userId,
            token,
            github_base_url
          );

          if (!createResult.success) {
            // Return validation error with missing scopes if available
            const failureResult = createResult as { success: false; error: string; missingScopes?: string[] };
            if (failureResult.missingScopes) {
              return {
                error: failureResult.error,
                missingScopes: failureResult.missingScopes,
              };
            }
            throw new Error(failureResult.error);
          }

          const connection = createResult.connection;

          // Fetch GitHub emails for automatic associations
          const githubEmails = await this.oauthService.fetchUserEmails(
            token,
            github_base_url
          );

          // Create automatic email-based associations
          const verifiedEmails = githubEmails
            .filter((e) => e.verified)
            .map((e) => e.email);

          const associations =
            await this.associationService.createAutomaticAssociations(
              connection.id,
              verifiedEmails,
              connection.github_user_id,
              connection.github_username
            );

          this.logBusinessOperation(
            req,
            'PAT_CONNECTED',
            'github_connection',
            connection.id.toString(),
            {
              githubUserId: connection.github_user_id,
              githubUsername: connection.github_username,
              associationsCreated: associations.length,
              scopes: connection.scopes,
            }
          );

          return {
            connection,
            associations_created: associations.length,
          };
        },
        req,
        res,
        'Failed to connect with Personal Access Token'
      );

      if (result) {
        // Check if result contains an error (validation failed)
        if ('error' in result) {
          return res.status(400).json({
            error: result.error,
            missingScopes: result.missingScopes,
            requestId: req.requestId,
          });
        }

        this.sendSuccess(req, res, result, 'GitHub account connected successfully');
      }
    }
  );

  /**
   * POST /api/github-connections/:id/associations
   * Manually create an association between connection and person
   *
   * Implementation: Task T035 (Phase 5 - User Story 3)
   */
  createAssociation = this.asyncHandler(
    async (req: RequestWithContext, res: Response) => {
      if (!req.user?.id) {
        return this.sendError(req, res, 'Unauthorized', 401);
      }

      // Verify system admin permissions
      if (!req.user.is_system_admin) {
        return this.sendError(req, res, 'Admin permissions required', 403);
      }

      const { id } = req.params;
      const connectionId = parseInt(id, 10);
      const { person_id } = req.body;

      if (isNaN(connectionId)) {
        return this.handleValidationError(req, res, {
          id: 'Invalid connection ID',
        });
      }

      // person_id 是 people 的 uuid 字符串(2026-10-13 批清): 原 isNaN
      // 数字校验把所有 uuid 一律 400——手动关联功能自出生即不可用;改由
      // 下方 people 存在性检查承担校验
      if (!person_id || typeof person_id !== 'string') {
        return this.handleValidationError(req, res, {
          person_id: 'Valid person ID is required',
        });
      }

      const personId = person_id;

      const result = await this.executeQuery(
        async () => {
          // Verify connection exists and user owns it
          const connection = await this.connectionService.findById(
            connectionId
          );

          if (!connection) {
            this.handleNotFound(req, res, 'GitHub connection');
            return null;
          }

          if (connection.user_id !== parseInt(req.user!.id, 10)) {
            this.sendError(req, res, 'Forbidden', 403);
            return null;
          }

          // Verify person exists
          const person = await this.db('people')
            .where({ id: personId })
            .first();

          if (!person) {
            this.handleNotFound(req, res, 'Person');
            return null;
          }

          // Create manual association
          const association =
            await this.associationService.createManualAssociation(
              connectionId,
              personId,
              parseInt(req.user!.id, 10)
            );

          this.logBusinessOperation(
            req,
            'CREATE',
            'github_association',
            association.id.toString(),
            {
              connectionId,
              personId,
              personName: person.name,
              associationType: 'manual',
            }
          );

          return association;
        },
        req,
        res,
        'Failed to create association'
      );

      if (result) {
        this.sendSuccess(
          req,
          res,
          result,
          'Association created successfully'
        );
      }
    }
  );

  /**
   * DELETE /api/github-connections/:id/associations/:person_id
   * Remove an association between connection and person
   *
   * Implementation: Task T036 (Phase 5 - User Story 3)
   */
  deleteAssociation = this.asyncHandler(
    async (req: RequestWithContext, res: Response) => {
      if (!req.user?.id) {
        return this.sendError(req, res, 'Unauthorized', 401);
      }

      // Verify system admin permissions
      if (!req.user.is_system_admin) {
        return this.sendError(req, res, 'Admin permissions required', 403);
      }

      const { id, person_id } = req.params;
      const connectionId = parseInt(id, 10);
      // person_id 是 uuid 字符串(同 create 侧修正,2026-10-13)
      const personId = person_id;

      if (isNaN(connectionId)) {
        return this.handleValidationError(req, res, {
          id: 'Invalid connection ID',
        });
      }

      if (!personId) {
        return this.handleValidationError(req, res, {
          person_id: 'Invalid person ID',
        });
      }

      const result = await this.executeQuery(
        async () => {
          // Verify connection exists and user owns it
          const connection = await this.connectionService.findById(
            connectionId
          );

          if (!connection) {
            this.handleNotFound(req, res, 'GitHub connection');
            return null;
          }

          if (connection.user_id !== parseInt(req.user!.id, 10)) {
            this.sendError(req, res, 'Forbidden', 403);
            return null;
          }

          // Get person info for logging
          const person = await this.db('people')
            .where({ id: personId })
            .first();

          // Remove association (deactivate)
          const removed = await this.associationService.removeAssociation(
            connectionId,
            personId
          );

          if (!removed) {
            this.handleNotFound(req, res, 'Association');
            return null;
          }

          this.logBusinessOperation(
            req,
            'DELETE',
            'github_association',
            `${connectionId}-${personId}`,
            {
              connectionId,
              personId,
              personName: person?.name,
            }
          );

          return { deleted: true, connectionId, personId };
        },
        req,
        res,
        'Failed to remove association'
      );

      if (result) {
        this.sendSuccess(
          req,
          res,
          result,
          'Association removed successfully'
        );
      }
    }
  );
}

// Export factory function for lazy instantiation
// Controller is created on first use, not at module load time
let controllerInstance: GitHubConnectionController | null = null;
export function getGitHubConnectionController(): GitHubConnectionController {
  if (!controllerInstance) {
    controllerInstance = new GitHubConnectionController();
  }
  return controllerInstance;
}

export default getGitHubConnectionController;

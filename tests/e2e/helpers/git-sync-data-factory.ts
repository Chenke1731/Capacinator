/**
 * Git Sync Data Factory for E2E Testing
 * Feature: 001-git-sync-integration (Issue #109)
 *
 * Extends UnifiedTestDataFactory with Git sync-specific test data generation.
 * Supports:
 * - Conflict scenario generation
 * - Multi-user test data with GitHub connections
 * - Branch setup helpers
 * - Scenario export data generation
 *
 * @example
 * ```typescript
 * const factory = new GitSyncDataFactory(apiContext, 'git-sync-test');
 *
 * // Create multi-user scenario
 * const { users, scenarios } = await factory.gitScenarios.multiUserCollaboration();
 *
 * // Create conflict scenario
 * const conflict = await factory.gitScenarios.conflictingEdits();
 *
 * // Cleanup
 * await factory.cleanup();
 * ```
 */

import { APIRequestContext } from '@playwright/test';
import {
  UnifiedTestDataFactory,
  Person,
  Project,
  Scenario,
  Assignment,
  Role
} from './unified-test-data-factory';

// ============================================================================
// Types
// ============================================================================

/**
 * GitHub connection for a person
 */
export interface GitHubConnection {
  id?: string;
  person_id: string;
  github_user_id: string;
  github_username: string;
  access_token?: string;
  token_type: 'personal-access-token' | 'oauth';
  scopes: string[];
  expires_at?: string;
  created_at?: string;
  last_used_at?: string;
}

/**
 * Git branch metadata
 */
export interface BranchMetadata {
  name: string;
  scenario_id: string;
  created_by: string;
  created_at: string;
  last_sync_at?: string;
  sync_status: 'synced' | 'ahead' | 'behind' | 'diverged' | 'conflict';
}

/**
 * Conflict scenario data
 */
export interface ConflictScenarioData {
  baseScenario: Scenario;
  localScenario: Scenario;
  remoteScenario: Scenario;
  conflictingFields: string[];
  localChanges: ConflictChange[];
  remoteChanges: ConflictChange[];
}

/**
 * Individual change in a conflict
 */
export interface ConflictChange {
  entityType: 'project' | 'person' | 'assignment' | 'scenario';
  entityId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changedBy: string;
  changedAt: string;
}

/**
 * Multi-user collaboration scenario
 */
export interface MultiUserScenario {
  users: Array<{
    person: Person;
    connection: GitHubConnection;
    branch: BranchMetadata;
  }>;
  sharedScenario: Scenario;
  assignments: Assignment[];
  projects: Project[];
}

/**
 * Sync state for testing
 */
export interface SyncState {
  local: {
    commitHash: string;
    modifiedEntities: string[];
  };
  remote: {
    commitHash: string;
    modifiedEntities: string[];
  };
  status: 'synced' | 'ahead' | 'behind' | 'diverged';
}

// ============================================================================
// Git Sync Data Factory
// ============================================================================

export class GitSyncDataFactory extends UnifiedTestDataFactory {
  private createdConnections: string[] = [];
  private createdBranches: string[] = [];

  constructor(
    apiContext: APIRequestContext,
    testPrefix: string = 'git-sync',
    retryConfig?: { maxRetries?: number; delayMs?: number; backoffMultiplier?: number }
  ) {
    super(apiContext, testPrefix, retryConfig);
  }

  // ==========================================================================
  // GitHub Connection Methods
  // ==========================================================================

  /**
   * Create a GitHub connection for a person
   */
  async createGitHubConnection(data: {
    person_id: string;
    github_username?: string;
    token_type?: 'personal-access-token' | 'oauth';
    scopes?: string[];
  }): Promise<GitHubConnection> {
    const username = data.github_username || `testuser_${Date.now()}`;

    // For E2E tests, we mock the connection creation
    // In real tests, this would call the API
    const connection: GitHubConnection = {
      id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      person_id: data.person_id,
      github_user_id: `gh_${Math.random().toString(36).substr(2, 8)}`,
      github_username: username,
      access_token: `mock_token_${username}`,
      token_type: data.token_type || 'personal-access-token',
      scopes: data.scopes || ['repo', 'read:user'],
      created_at: new Date().toISOString(),
      last_used_at: new Date().toISOString()
    };

    this.createdConnections.push(connection.id!);
    return connection;
  }

  /**
   * Create a branch metadata entry
   */
  async createBranchMetadata(data: {
    name: string;
    scenario_id: string;
    created_by: string;
    sync_status?: BranchMetadata['sync_status'];
  }): Promise<BranchMetadata> {
    const branch: BranchMetadata = {
      name: data.name,
      scenario_id: data.scenario_id,
      created_by: data.created_by,
      created_at: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
      sync_status: data.sync_status || 'synced'
    };

    this.createdBranches.push(branch.name);
    return branch;
  }

  // ==========================================================================
  // Git-Specific Test Scenarios
  // ==========================================================================

  /**
   * Pre-built Git sync test scenarios
   */
  gitScenarios = {
    /**
     * Create a multi-user collaboration scenario
     * Simulates multiple users working on the same scenario from different branches
     */
    multiUserCollaboration: async (userCount: number = 3): Promise<MultiUserScenario> => {
      const roles = await this.ensureRoles();
      const developerRole = roles.find(r => r.name === 'Developer') || roles[0];

      // Create shared scenario
      const sharedScenario = await this.createScenario({
        name: this.getTestPrefix() + '_Shared_Scenario',
        scenario_type: 'sandbox',
        status: 'active'
      });

      // Create projects for collaboration
      const projects = await Promise.all([
        this.createProject({ name: this.getTestPrefix() + '_Collab_Project_1' }),
        this.createProject({ name: this.getTestPrefix() + '_Collab_Project_2' })
      ]);

      // Create users with connections and branches
      const users: MultiUserScenario['users'] = [];
      const assignments: Assignment[] = [];

      for (let i = 0; i < userCount; i++) {
        const person = await this.createPerson({
          name: this.getTestPrefix() + `_Collaborator_${i + 1}`
        });

        const connection = await this.createGitHubConnection({
          person_id: person.id!,
          github_username: `collab_user_${i + 1}`
        });

        const branch = await this.createBranchMetadata({
          name: `scenario/${sharedScenario.id}/user_${i + 1}`,
          scenario_id: sharedScenario.id!,
          created_by: person.id!,
          sync_status: 'synced'
        });

        users.push({ person, connection, branch });

        // Create assignment for this user
        const assignment = await this.createAssignment({
          person_id: person.id!,
          project_id: projects[i % projects.length].id!,
          role_id: developerRole.id!,
          allocation_percentage: 50 + (i * 10),
          scenario_id: sharedScenario.id
        });
        assignments.push(assignment);
      }

      return {
        users,
        sharedScenario,
        assignments,
        projects
      };
    },

    /**
     * Create a conflicting edits scenario
     * Simulates two users editing the same entities in incompatible ways
     */
    conflictingEdits: async (): Promise<ConflictScenarioData> => {
      // Create base scenario
      const baseScenario = await this.createScenario({
        name: this.getTestPrefix() + '_Base_Scenario',
        scenario_type: 'baseline',
        status: 'active'
      });

      // Create local scenario (child of base)
      const localScenario = await this.createScenario({
        name: this.getTestPrefix() + '_Local_Scenario',
        scenario_type: 'sandbox',
        parent_scenario_id: baseScenario.id
      });

      // Create remote scenario (also child of base - simulates another user's branch)
      const remoteScenario = await this.createScenario({
        name: this.getTestPrefix() + '_Remote_Scenario',
        scenario_type: 'sandbox',
        parent_scenario_id: baseScenario.id
      });

      // Create conflicting project
      const project = await this.createProject({
        name: this.getTestPrefix() + '_Conflict_Project',
        priority: 3
      });

      // Create users who made changes
      const localUser = await this.createPerson({
        name: this.getTestPrefix() + '_Local_User'
      });
      const remoteUser = await this.createPerson({
        name: this.getTestPrefix() + '_Remote_User'
      });

      // Define conflicting changes
      const localChanges: ConflictChange[] = [
        {
          entityType: 'project',
          entityId: project.id!,
          field: 'priority',
          oldValue: 3,
          newValue: 1,
          changedBy: localUser.id!,
          changedAt: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
        }
      ];

      const remoteChanges: ConflictChange[] = [
        {
          entityType: 'project',
          entityId: project.id!,
          field: 'priority',
          oldValue: 3,
          newValue: 5,
          changedBy: remoteUser.id!,
          changedAt: new Date(Date.now() - 1800000).toISOString() // 30 min ago
        }
      ];

      return {
        baseScenario,
        localScenario,
        remoteScenario,
        conflictingFields: ['priority'],
        localChanges,
        remoteChanges
      };
    },

    /**
     * Create a diverged branch scenario
     * Simulates a branch that has both local and remote changes
     */
    divergedBranch: async (): Promise<{
      scenario: Scenario;
      branch: BranchMetadata;
      localCommits: number;
      remoteCommits: number;
      syncState: SyncState;
    }> => {
      const scenario = await this.createScenario({
        name: this.getTestPrefix() + '_Diverged_Scenario',
        scenario_type: 'sandbox'
      });

      const user = await this.createPerson({
        name: this.getTestPrefix() + '_Diverged_User'
      });

      const branch = await this.createBranchMetadata({
        name: `scenario/${scenario.id}/diverged`,
        scenario_id: scenario.id!,
        created_by: user.id!,
        sync_status: 'diverged'
      });

      const syncState: SyncState = {
        local: {
          commitHash: 'local_abc123',
          modifiedEntities: ['project_1', 'assignment_1']
        },
        remote: {
          commitHash: 'remote_def456',
          modifiedEntities: ['project_1', 'person_1']
        },
        status: 'diverged'
      };

      return {
        scenario,
        branch,
        localCommits: 2,
        remoteCommits: 3,
        syncState
      };
    },

    /**
     * Create an offline queue scenario
     * Simulates pending changes that couldn't be synced due to network issues
     */
    offlineQueue: async (pendingChanges: number = 5): Promise<{
      scenario: Scenario;
      queuedChanges: ConflictChange[];
      lastSyncAttempt: string;
    }> => {
      const scenario = await this.createScenario({
        name: this.getTestPrefix() + '_Offline_Scenario',
        scenario_type: 'sandbox'
      });

      const user = await this.createPerson({
        name: this.getTestPrefix() + '_Offline_User'
      });

      const project = await this.createProject({
        name: this.getTestPrefix() + '_Offline_Project'
      });

      // Generate queued changes
      const queuedChanges: ConflictChange[] = [];
      for (let i = 0; i < pendingChanges; i++) {
        queuedChanges.push({
          entityType: i % 2 === 0 ? 'project' : 'assignment',
          entityId: `entity_${i}`,
          field: 'allocation_percentage',
          oldValue: 50 + i,
          newValue: 60 + i,
          changedBy: user.id!,
          changedAt: new Date(Date.now() - (pendingChanges - i) * 60000).toISOString()
        });
      }

      return {
        scenario,
        queuedChanges,
        lastSyncAttempt: new Date(Date.now() - 300000).toISOString() // 5 min ago
      };
    },

    /**
     * Create a scenario with large data for performance testing
     */
    largeDataSet: async (config: {
      projects?: number;
      people?: number;
      assignmentsPerPerson?: number;
    } = {}): Promise<{
      scenario: Scenario;
      projects: Project[];
      people: Person[];
      assignments: Assignment[];
      expectedExportSizeKB: number;
    }> => {
      const {
        projects: projectCount = 50,
        people: peopleCount = 30,
        assignmentsPerPerson = 3
      } = config;

      const roles = await this.ensureRoles();
      const developerRole = roles.find(r => r.name === 'Developer') || roles[0];

      const scenario = await this.createScenario({
        name: this.getTestPrefix() + '_Large_Scenario',
        scenario_type: 'sandbox'
      });

      // Create projects
      const projects: Project[] = [];
      for (let i = 0; i < projectCount; i++) {
        projects.push(await this.createProject({
          name: this.getTestPrefix() + `_Large_Project_${i + 1}`
        }));
      }

      // Create people
      const people: Person[] = [];
      for (let i = 0; i < peopleCount; i++) {
        people.push(await this.createPerson({
          name: this.getTestPrefix() + `_Large_Person_${i + 1}`
        }));
      }

      // Create assignments
      const assignments: Assignment[] = [];
      for (const person of people) {
        for (let i = 0; i < assignmentsPerPerson; i++) {
          const projectIndex = (people.indexOf(person) * assignmentsPerPerson + i) % projectCount;
          assignments.push(await this.createAssignment({
            person_id: person.id!,
            project_id: projects[projectIndex].id!,
            role_id: developerRole.id!,
            allocation_percentage: Math.floor(100 / assignmentsPerPerson),
            scenario_id: scenario.id
          }));
        }
      }

      // Estimate export size (rough calculation)
      const estimatedSize = (projectCount * 0.5) + (peopleCount * 0.3) + (assignments.length * 0.2);

      return {
        scenario,
        projects,
        people,
        assignments,
        expectedExportSizeKB: Math.round(estimatedSize)
      };
    },

    /**
     * Create a scenario hierarchy for branching tests
     */
    branchHierarchy: async (depth: number = 3): Promise<{
      rootScenario: Scenario;
      branches: Array<{
        level: number;
        scenario: Scenario;
        branch: BranchMetadata;
      }>;
    }> => {
      const rootScenario = await this.createScenario({
        name: this.getTestPrefix() + '_Root_Scenario',
        scenario_type: 'baseline',
        status: 'active'
      });

      const user = await this.createPerson({
        name: this.getTestPrefix() + '_Branch_User'
      });

      const branches: Array<{
        level: number;
        scenario: Scenario;
        branch: BranchMetadata;
      }> = [];

      let parentId = rootScenario.id;
      for (let level = 1; level <= depth; level++) {
        const scenario = await this.createScenario({
          name: this.getTestPrefix() + `_Level_${level}_Scenario`,
          scenario_type: 'sandbox',
          parent_scenario_id: parentId
        });

        const branch = await this.createBranchMetadata({
          name: `scenario/${scenario.id}/level_${level}`,
          scenario_id: scenario.id!,
          created_by: user.id!,
          sync_status: 'synced'
        });

        branches.push({ level, scenario, branch });
        parentId = scenario.id;
      }

      return { rootScenario, branches };
    }
  };

  // ==========================================================================
  // Sync State Helpers
  // ==========================================================================

  /**
   * Create a mock sync state for testing
   */
  createMockSyncState(config: {
    status: SyncState['status'];
    localChanges?: number;
    remoteChanges?: number;
  }): SyncState {
    const localEntities = Array.from(
      { length: config.localChanges || 0 },
      (_, i) => `local_entity_${i}`
    );
    const remoteEntities = Array.from(
      { length: config.remoteChanges || 0 },
      (_, i) => `remote_entity_${i}`
    );

    return {
      local: {
        commitHash: `local_${Math.random().toString(36).substr(2, 8)}`,
        modifiedEntities: localEntities
      },
      remote: {
        commitHash: `remote_${Math.random().toString(36).substr(2, 8)}`,
        modifiedEntities: remoteEntities
      },
      status: config.status
    };
  }

  /**
   * Create mock export data for a scenario
   */
  createMockExportData(scenario: Scenario, options?: {
    projects?: Project[];
    people?: Person[];
    assignments?: Assignment[];
  }): {
    version: string;
    exportedAt: string;
    scenario: Scenario;
    data: {
      projects: Project[];
      people: Person[];
      assignments: Assignment[];
    };
  } {
    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      scenario,
      data: {
        projects: options?.projects || [],
        people: options?.people || [],
        assignments: options?.assignments || []
      }
    };
  }

  // ==========================================================================
  // Cleanup Override
  // ==========================================================================

  /**
   * Clean up all created test data including Git-specific entities
   */
  async cleanup(): Promise<void> {
    // Clean up Git-specific data first
    // Note: In real implementation, this would call cleanup APIs
    this.createdConnections = [];
    this.createdBranches = [];

    // Call parent cleanup
    await super.cleanup();
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get test prefix (exposed for scenarios)
   */
  getTestPrefix(): string {
    return super.getTestPrefix();
  }

  /**
   * Get count of created Git-specific entities
   */
  getGitCreatedCounts(): Record<string, number> {
    return {
      ...super.getCreatedCounts(),
      connections: this.createdConnections.length,
      branches: this.createdBranches.length
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new GitSyncDataFactory instance
 */
export function createGitSyncDataFactory(
  apiContext: APIRequestContext,
  testPrefix?: string
): GitSyncDataFactory {
  return new GitSyncDataFactory(apiContext, testPrefix);
}

export default GitSyncDataFactory;

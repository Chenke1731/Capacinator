import { getDb } from '../database/index.js';
import type { Knex } from 'knex';
import type {
  GitHubAccountAssociation,
  GitHubAssociationType,
  CreateGitHubAssociationInput,
} from '../../../shared/types/github.js';

/**
 * GitHubAssociationService
 *
 * Manages associations between GitHub connections and people resources.
 * Supports many-to-many relationships (one GitHub account can link to multiple people).
 *
 * This is the skeleton implementation - automatic email matching logic will be added later.
 */
export class GitHubAssociationService {
  private db: Knex;

  constructor() {
    this.db = getDb();
  }

  /**
   * Create a new GitHub association
   *
   * @param input - Association details
   * @returns Created association
   */
  async create(
    input: CreateGitHubAssociationInput
  ): Promise<GitHubAccountAssociation> {
    const associationData = {
      github_connection_id: input.github_connection_id,
      person_id: input.person_id,
      association_type: input.association_type as GitHubAssociationType,
      associated_by_user_id: input.associated_by_user_id || null,
      active: true,
      created_at: this.db.fn.now(),
      updated_at: this.db.fn.now(),
    };

    const [id] = await this.db('github_account_associations').insert(
      associationData
    );

    // Retrieve and return the created association
    const association = await this.findById(id);
    if (!association) {
      throw new Error(`Failed to retrieve created association with id ${id}`);
    }

    return association;
  }

  /**
   * Find an association by ID
   *
   * @param id - Association ID
   * @returns Association or null if not found
   */
  async findById(id: number): Promise<GitHubAccountAssociation | null> {
    const row = await this.db('github_account_associations')
      .where({ id })
      .first();

    if (!row) {
      return null;
    }

    return this.mapRowToAssociation(row);
  }

  /**
   * Find all active associations for a GitHub connection
   *
   * @param githubConnectionId - GitHub connection ID
   * @param includeInactive - Include inactive associations
   * @returns Array of associations
   */
  async findByConnectionId(
    githubConnectionId: number,
    includeInactive = false
  ): Promise<GitHubAccountAssociation[]> {
    // join people 带出 person_name/person_email(2026-10-13 批清): 客户端
    // 关联列表一直渲染这两个字段,服务端从未提供——恒空白的潜伏显示洞
    let query = this.db('github_account_associations as gaa')
      .leftJoin('people', 'gaa.person_id', 'people.id')
      .where({
        'gaa.github_connection_id': githubConnectionId,
      })
      .select('gaa.*', 'people.name as person_name', 'people.email as person_email');

    if (!includeInactive) {
      query = query.where('gaa.active', true);
    }

    const rows = await query.orderBy('gaa.created_at', 'desc');

    return rows.map((row) => this.mapRowToAssociation(row));
  }

  /**
   * Find all active associations for a person
   *
   * @param personId - Person ID
   * @param includeInactive - Include inactive associations
   * @returns Array of associations
   */
  async findByPersonId(
    personId: string,
    includeInactive = false
  ): Promise<GitHubAccountAssociation[]> {
    let query = this.db('github_account_associations').where({
      person_id: personId,
    });

    if (!includeInactive) {
      query = query.where({ active: true });
    }

    const rows = await query.orderBy('created_at', 'desc');

    return rows.map((row) => this.mapRowToAssociation(row));
  }

  /**
   * Find a specific association between connection and person
   *
   * @param githubConnectionId - GitHub connection ID
   * @param personId - Person ID
   * @param includeInactive - Include inactive associations
   * @returns Association or null if not found
   */
  async findByConnectionAndPerson(
    githubConnectionId: number,
    personId: string,
    includeInactive = false
  ): Promise<GitHubAccountAssociation | null> {
    let query = this.db('github_account_associations').where({
      github_connection_id: githubConnectionId,
      person_id: personId,
    });

    if (!includeInactive) {
      query = query.where({ active: true });
    }

    const row = await query.first();

    if (!row) {
      return null;
    }

    return this.mapRowToAssociation(row);
  }

  /**
   * Deactivate an association (soft delete)
   *
   * @param id - Association ID
   * @returns True if deactivated, false if not found
   */
  async deactivate(id: number): Promise<boolean> {
    const updatedCount = await this.db('github_account_associations')
      .where({ id })
      .update({
        active: false,
        updated_at: this.db.fn.now(),
      });

    return updatedCount > 0;
  }

  /**
   * Permanently delete an association
   *
   * @param id - Association ID
   * @returns True if deleted, false if not found
   */
  async delete(id: number): Promise<boolean> {
    const deletedCount = await this.db('github_account_associations')
      .where({ id })
      .delete();

    return deletedCount > 0;
  }

  /**
   * Deactivate all associations for a GitHub connection
   *
   * @param githubConnectionId - GitHub connection ID
   * @returns Number of associations deactivated
   */
  async deactivateByConnectionId(githubConnectionId: number): Promise<number> {
    return await this.db('github_account_associations')
      .where({ github_connection_id: githubConnectionId, active: true })
      .update({
        active: false,
        updated_at: this.db.fn.now(),
      });
  }

  /**
   * Deactivate all associations for a person
   *
   * @param personId - Person ID
   * @returns Number of associations deactivated
   */
  async deactivateByPersonId(personId: string): Promise<number> {
    return await this.db('github_account_associations')
      .where({ person_id: personId, active: true })
      .update({
        active: false,
        updated_at: this.db.fn.now(),
      });
  }

  /**
   * Reactivate an association
   *
   * @param id - Association ID
   * @returns True if reactivated, false if not found
   */
  async reactivate(id: number): Promise<boolean> {
    const updatedCount = await this.db('github_account_associations')
      .where({ id })
      .update({
        active: true,
        updated_at: this.db.fn.now(),
      });

    return updatedCount > 0;
  }

  /**
   * Get all people IDs associated with a GitHub connection
   *
   * @param githubConnectionId - GitHub connection ID
   * @returns Array of person IDs
   */
  async getPeopleIdsForConnection(
    githubConnectionId: number
  ): Promise<number[]> {
    const rows = await this.db('github_account_associations')
      .where({ github_connection_id: githubConnectionId, active: true })
      .select('person_id');

    return rows.map((row) => row.person_id);
  }

  /**
   * Get all GitHub connection IDs associated with a person
   *
   * @param personId - Person ID
   * @returns Array of GitHub connection IDs
   */
  async getConnectionIdsForPerson(personId: string): Promise<number[]> {
    const rows = await this.db('github_account_associations')
      .where({ person_id: personId, active: true })
      .select('github_connection_id');

    return rows.map((row) => row.github_connection_id);
  }

  /**
   * Check if an association exists between connection and person
   *
   * @param githubConnectionId - GitHub connection ID
   * @param personId - Person ID
   * @returns True if active association exists
   */
  async exists(
    githubConnectionId: number,
    personId: string
  ): Promise<boolean> {
    const association = await this.findByConnectionAndPerson(
      githubConnectionId,
      personId,
      false
    );
    return association !== null;
  }

  /**
   * Create automatic email-based associations
   *
   * Matches GitHub account emails to people resources in the database.
   * Creates automatic associations for all matching people.
   *
   * @param githubConnectionId - GitHub connection ID
   * @param githubEmails - Array of verified GitHub email addresses
   * @param githubUserId - GitHub user ID for people table cache
   * @param githubUsername - GitHub username for people table cache
   * @returns Array of created associations
   */
  async createAutomaticAssociations(
    githubConnectionId: number,
    githubEmails: string[],
    githubUserId: number,
    githubUsername: string
  ): Promise<GitHubAccountAssociation[]> {
    if (githubEmails.length === 0) {
      return [];
    }

    // Find all people with matching emails
    const matchingPeople = await this.db('people')
      .whereIn('email', githubEmails)
      .select('id', 'email', 'name');

    if (matchingPeople.length === 0) {
      return [];
    }

    const createdAssociations: GitHubAccountAssociation[] = [];

    // Create associations for each matching person
    for (const person of matchingPeople) {
      // Check if association already exists
      const existing = await this.findByConnectionAndPerson(
        githubConnectionId,
        person.id,
        false
      );

      if (existing) {
        // Skip if already associated
        continue;
      }

      // Create automatic association
      const association = await this.create({
        github_connection_id: githubConnectionId,
        person_id: person.id,
        association_type: 'automatic',
        associated_by_user_id: null,
      });

      createdAssociations.push(association);

      // Update people table cache with GitHub info
      await this.updatePeopleCache(person.id, githubUserId, githubUsername);
    }

    return createdAssociations;
  }

  /**
   * Create a manual association between GitHub connection and person
   *
   * Task T033 (Phase 5 - User Story 3)
   *
   * @param githubConnectionId - GitHub connection ID
   * @param personId - Person ID to associate
   * @param adminUserId - Admin user creating the association
   * @returns Created association
   */
  async createManualAssociation(
    githubConnectionId: number,
    personId: string,
    adminUserId: number
  ): Promise<GitHubAccountAssociation> {
    // Check if association already exists
    const existing = await this.findByConnectionAndPerson(
      githubConnectionId,
      personId,
      false
    );

    if (existing) {
      throw new Error(
        `Association already exists between GitHub connection ${githubConnectionId} and person ${personId}`
      );
    }

    // Create manual association
    const association = await this.create({
      github_connection_id: githubConnectionId,
      person_id: personId,
      association_type: 'manual',
      associated_by_user_id: adminUserId,
    });

    // Get GitHub connection info for cache update
    const connection = await this.db('github_connections')
      .where({ id: githubConnectionId })
      .first();

    if (connection) {
      await this.updatePeopleCache(
        personId,
        connection.github_user_id,
        connection.github_username
      );
    }

    return association;
  }

  /**
   * Remove an association between GitHub connection and person
   *
   * Task T033 (Phase 5 - User Story 3)
   *
   * @param githubConnectionId - GitHub connection ID
   * @param personId - Person ID
   * @returns True if removed, false if not found
   */
  async removeAssociation(
    githubConnectionId: number,
    personId: string
  ): Promise<boolean> {
    const association = await this.findByConnectionAndPerson(
      githubConnectionId,
      personId,
      false
    );

    if (!association) {
      return false;
    }

    // Deactivate the association (soft delete)
    const deactivated = await this.deactivate(association.id);

    if (deactivated) {
      // Clear GitHub info from people cache if no other active associations
      const otherAssociations = await this.findByPersonId(personId, false);
      if (otherAssociations.length === 0) {
        await this.db('people')
          .where({ id: personId })
          .update({
            github_user_id: null,
            github_username: null,
            updated_at: this.db.fn.now(),
          });
      }
    }

    return deactivated;
  }

  /**
   * Update people table cache with GitHub information
   *
   * Task T041 (Phase 5 - User Story 3)
   *
   * @param personId - Person ID to update
   * @param githubUserId - GitHub user ID
   * @param githubUsername - GitHub username
   */
  async updatePeopleCache(
    personId: string,
    githubUserId: number,
    githubUsername: string
  ): Promise<void> {
    await this.db('people')
      .where({ id: personId })
      .update({
        github_user_id: githubUserId,
        github_username: githubUsername,
        updated_at: this.db.fn.now(),
      });
  }

  /**
   * Get associations with person and connection details
   *
   * Task T033 (Phase 5 - User Story 3)
   *
   * @param githubConnectionId - GitHub connection ID
   * @returns Array of associations with joined person data
   */
  async getAssociationsWithDetails(
    githubConnectionId: number
  ): Promise<
    Array<
      GitHubAccountAssociation & {
        person_name: string;
        person_email: string;
      }
    >
  > {
    const rows = await this.db('github_account_associations as gaa')
      .join('people as p', 'gaa.person_id', 'p.id')
      .where('gaa.github_connection_id', githubConnectionId)
      .where('gaa.active', true)
      .select(
        'gaa.*',
        'p.name as person_name',
        'p.email as person_email'
      )
      .orderBy('gaa.created_at', 'desc');

    return rows.map((row) => ({
      ...this.mapRowToAssociation(row),
      person_name: row.person_name,
      person_email: row.person_email,
    }));
  }

  /**
   * Map database row to GitHubAccountAssociation interface
   *
   * @param row - Database row
   * @returns GitHubAccountAssociation object
   */
  private mapRowToAssociation(row: any): GitHubAccountAssociation {
    return {
      id: row.id,
      github_connection_id: row.github_connection_id,
      person_id: row.person_id,
      person_name: row.person_name ?? null,
      person_email: row.person_email ?? null,
      association_type: row.association_type as GitHubAssociationType,
      associated_by_user_id: row.associated_by_user_id,
      active: Boolean(row.active),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

// Singleton instance for application-wide use
let gitHubAssociationServiceInstance: GitHubAssociationService | null = null;

/**
 * Get singleton GitHubAssociationService instance
 *
 * @returns GitHubAssociationService instance
 */
export function getGitHubAssociationService(): GitHubAssociationService {
  if (!gitHubAssociationServiceInstance) {
    gitHubAssociationServiceInstance = new GitHubAssociationService();
  }
  return gitHubAssociationServiceInstance;
}

// Export singleton instance as default
export default getGitHubAssociationService();

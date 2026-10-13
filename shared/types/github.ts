/**
 * GitHub Authentication and Association Types
 *
 * These types represent GitHub connections and their associations with
 * people resources for commit attribution across the Capacinator system.
 */

/**
 * GitHub Connection Methods
 */
export type GitHubConnectionMethod = 'oauth' | 'pat';

/**
 * GitHub Connection Status
 */
export type GitHubConnectionStatus = 'active' | 'expired' | 'revoked' | 'error';

/**
 * GitHub Account Association Type
 */
export type GitHubAssociationType = 'automatic' | 'manual';

/**
 * GitHub Connection
 *
 * Represents a link between a Capacinator user and a GitHub account.
 * Stores encrypted credentials (OAuth tokens or PATs) for Git sync operations.
 */
export interface GitHubConnection {
  id: number;
  user_id: number;
  github_user_id: number;
  github_username: string;
  connection_method: GitHubConnectionMethod;
  encrypted_token: string;
  token_expires_at: string | null;  // ISO 8601 datetime string
  refresh_token: string | null;
  scopes: string[];  // Array of GitHub permission scopes
  github_base_url: string;  // 'https://api.github.com' or GitHub Enterprise URL
  status: GitHubConnectionStatus;
  is_default: boolean;
  last_used_at: string | null;  // ISO 8601 datetime string
  encryption_version: number;
  created_at: string;  // ISO 8601 datetime string
  updated_at: string;  // ISO 8601 datetime string
}

/**
 * GitHub Connection Create Input
 *
 * Data required to create a new GitHub connection via OAuth or PAT.
 * Note: Services use plaintext access_token, encryption happens in service layer.
 */
export interface GitHubConnectionCreateInput {
  user_id: number;
  github_user_id: number;
  github_username: string;
  connection_method: GitHubConnectionMethod;
  access_token: string;  // Plaintext token - will be encrypted before storage
  token_expires_at?: string | null;
  refresh_token?: string | null;
  scopes: string[];
  github_base_url?: string;
  is_default?: boolean;
  status?: GitHubConnectionStatus;
}

// Alias for alternate naming convention
export type CreateGitHubConnectionInput = GitHubConnectionCreateInput;

/**
 * GitHub Connection Update Input
 *
 * Fields that can be updated on an existing GitHub connection.
 */
export interface GitHubConnectionUpdateInput {
  access_token?: string;  // Plaintext token - will be encrypted before storage
  github_username?: string;
  token_expires_at?: string | null;
  refresh_token?: string | null;
  scopes?: string[];
  status?: GitHubConnectionStatus;
  is_default?: boolean;
  last_used_at?: string | null;
}

// Alias for alternate naming convention
export type UpdateGitHubConnectionInput = GitHubConnectionUpdateInput;

/**
 * GitHub Account Association
 *
 * Many-to-many mapping between GitHub connections and people resources.
 * Enables proper commit attribution when the same person has multiple
 * people resource records (e.g., consultant working across teams).
 */
export interface GitHubAccountAssociation {
  id: number;
  github_connection_id: number;
  /** people.id 是 uuid 字符串——050 列虽声明 INTEGER,SQLite 松类型实际存
   *  字符串(2026-10-13 批清: 原数字类型逼出客户端 parseInt(uuid)=NaN) */
  person_id: string;
  /** join 注入(2026-10-13): 关联列表渲染用,创建输入不带 */
  person_name: string | null;
  person_email: string | null;
  association_type: GitHubAssociationType;
  associated_by_user_id: number | null;  // NULL for automatic associations
  active: boolean;
  created_at: string;  // ISO 8601 datetime string
  updated_at: string;  // ISO 8601 datetime string
}

/**
 * GitHub Account Association Create Input
 *
 * Data required to create a new association between a GitHub connection
 * and a people resource.
 */
export interface GitHubAccountAssociationCreateInput {
  github_connection_id: number;
  person_id: string;
  association_type: GitHubAssociationType;
  associated_by_user_id?: number | null;
}

// Alias for alternate naming convention
export type CreateGitHubAssociationInput = GitHubAccountAssociationCreateInput;

/**
 * OAuth State
 *
 * Temporary state data stored during the OAuth flow to prevent CSRF attacks.
 * State parameter is cryptographically random and validated on callback.
 */
export interface OAuthState {
  state: string;  // Cryptographically random state token
  user_id: number;  // User initiating the OAuth flow
  expires_at: number;  // Unix timestamp when state expires (10 minutes)
  github_base_url?: string;  // Optional GitHub Enterprise URL
}

/**
 * GitHub User Info (from GitHub API)
 *
 * Subset of GitHub user data returned by the API during connection.
 */
export interface GitHubUserInfo {
  id: number;  // GitHub user ID
  login: string;  // GitHub username
  email: string | null;  // Primary email (may be null if private)
  name: string | null;  // Display name
  avatar_url: string;
  html_url: string;
}

/**
 * GitHub Email (from GitHub API)
 *
 * Email addresses associated with a GitHub account.
 */
export interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

/**
 * PAT Connection Request
 *
 * Request body for connecting via Personal Access Token.
 */
export interface PATConnectionRequest {
  token: string;  // GitHub Personal Access Token
  github_base_url?: string;  // Optional GitHub Enterprise URL
}

/**
 * OAuth Authorization Response
 *
 * Response from OAuth authorization initiation endpoint.
 */
export interface OAuthAuthorizationResponse {
  authorization_url: string;  // URL to redirect user to GitHub
  state: string;  // CSRF protection state token
}

/**
 * GitHub Connection with Associations
 *
 * Extended connection object including associated people resources.
 * Used for displaying connection details in the UI.
 */
export interface GitHubConnectionWithAssociations extends GitHubConnection {
  associations: Array<{
    person_id: string;
    person_name: string;
    person_email: string;
    association_type: GitHubAssociationType;
  }>;
}

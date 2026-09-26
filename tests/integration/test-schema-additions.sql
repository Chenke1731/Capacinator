-- Additional tables needed for integration tests

-- Locations table
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Project types table
CREATE TABLE IF NOT EXISTS project_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Project subtypes table
CREATE TABLE IF NOT EXISTS project_sub_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_type_id TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  is_default INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_type_id) REFERENCES project_types(id) ON DELETE CASCADE
);

-- User permissions table
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id TEXT NOT NULL,
  project_id TEXT,
  permission_type TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  PRIMARY KEY (user_id, project_id, permission_type)
);

-- User permission overrides table
CREATE TABLE IF NOT EXISTS user_permission_overrides (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  override_type TEXT NOT NULL,
  override_value TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, project_id, override_type)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  recipient_id TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'unread',
  scheduled_for TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  read_at TEXT
);

-- Add missing columns to existing tables
-- Update projects table
ALTER TABLE projects ADD COLUMN project_type_id TEXT;
ALTER TABLE projects ADD COLUMN project_sub_type_id TEXT;
ALTER TABLE projects ADD COLUMN location_id TEXT;
ALTER TABLE projects ADD COLUMN status TEXT DEFAULT 'planning';
ALTER TABLE projects ADD COLUMN budget REAL;
ALTER TABLE projects ADD COLUMN created_by TEXT;
ALTER TABLE projects ADD COLUMN aspiration_start TEXT;
ALTER TABLE projects ADD COLUMN aspiration_finish TEXT;

-- Update project_assignments table  
ALTER TABLE project_assignments ADD COLUMN assignment_date_mode TEXT DEFAULT 'fixed';
ALTER TABLE project_assignments ADD COLUMN scenario_id TEXT;
ALTER TABLE project_assignments ADD COLUMN notes TEXT;

-- Make start_date and end_date nullable for phase/project based assignments
-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table
CREATE TABLE project_assignments_new (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  phase_id TEXT,
  allocation_percentage INTEGER NOT NULL DEFAULT 100,
  start_date TEXT,
  end_date TEXT,
  computed_start_date TEXT,
  computed_end_date TEXT,
  assignment_date_mode TEXT DEFAULT 'fixed',
  scenario_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (person_id) REFERENCES people(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (role_id) REFERENCES roles(id),
  FOREIGN KEY (phase_id) REFERENCES project_phases(id)
);

-- Copy data from old table (map columns that exist, use NULL/defaults for new columns)
INSERT INTO project_assignments_new (
  id, person_id, project_id, role_id, allocation_percentage,
  start_date, end_date, assignment_date_mode, scenario_id, notes,
  created_at, updated_at
)
SELECT
  id, person_id, project_id, role_id, allocation_percentage,
  start_date, end_date, assignment_date_mode, scenario_id, notes,
  created_at, updated_at
FROM project_assignments;

-- Drop old table and rename new one
DROP TABLE project_assignments;
ALTER TABLE project_assignments_new RENAME TO project_assignments;

-- Update people table
ALTER TABLE people ADD COLUMN default_hours_per_day REAL DEFAULT 8;
ALTER TABLE people ADD COLUMN worker_type TEXT DEFAULT 'employee';
ALTER TABLE people ADD COLUMN password TEXT;
ALTER TABLE people ADD COLUMN location_id TEXT;

-- Person roles table - drop and recreate to add id and timestamps
-- (no semicolons in comments: setup splits this file on semicolons)
-- proficiency_level is an INTEGER in production, and created_at/updated_at
-- keep defaults so both explicit-timestamp inserts (gaps-analysis) and
-- importer inserts (which omit them) work
DROP TABLE IF EXISTS person_roles;
CREATE TABLE person_roles (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  proficiency_level INTEGER NOT NULL DEFAULT 3,
  is_primary INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (person_id) REFERENCES people(id),
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- Add is_active column to people table
ALTER TABLE people ADD COLUMN is_active INTEGER DEFAULT 1;

-- Align with production schema drift (2026-09-26): people link their primary
-- role through the person_roles join row, and projects require a sub-type
-- (kept nullable here, unlike production, so direct project seeds keep working)
ALTER TABLE people ADD COLUMN primary_person_role_id TEXT;
ALTER TABLE projects ADD COLUMN project_sub_type_id TEXT;

-- Create person_availability_view
CREATE VIEW IF NOT EXISTS person_availability_view AS
SELECT 
  p.id as person_id,
  p.name as person_name,
  p.default_availability_percentage,
  p.default_hours_per_day,
  -- For now, just use the default availability percentage
  -- In the future, this could be enhanced to consider date-specific overrides
  p.default_availability_percentage as effective_availability_percentage,
  p.default_hours_per_day as effective_hours_per_day
FROM people p
WHERE p.is_active = 1;

-- Scenarios table
CREATE TABLE IF NOT EXISTS scenarios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  description TEXT,
  created_by TEXT,
  branch_point TEXT,
  scenario_type TEXT DEFAULT 'what-if',
  parent_scenario_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES people(id),
  FOREIGN KEY (parent_scenario_id) REFERENCES scenarios(id) ON DELETE SET NULL
);

-- Scenario projects table (tracks project changes in scenarios)
CREATE TABLE IF NOT EXISTS scenario_projects (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT,
  priority INTEGER,
  notes TEXT,
  change_type TEXT DEFAULT 'unchanged' CHECK(change_type IN ('added', 'removed', 'modified', 'unchanged')),
  aspiration_start TEXT,
  aspiration_finish TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Scenario project phases table (tracks phase changes in scenarios)
CREATE TABLE IF NOT EXISTS scenario_project_phases (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  phase_id TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  base_phase_timeline_id TEXT,
  notes TEXT,
  change_type TEXT DEFAULT 'unchanged' CHECK(change_type IN ('added', 'removed', 'modified', 'unchanged')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (phase_id) REFERENCES project_phases(id) ON DELETE CASCADE
);

-- Scenario project assignments table
CREATE TABLE IF NOT EXISTS scenario_project_assignments (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  phase_id TEXT,
  allocation_percentage INTEGER NOT NULL DEFAULT 100,
  assignment_date_mode TEXT DEFAULT 'fixed',
  change_type TEXT DEFAULT 'unchanged' CHECK(change_type IN ('added', 'removed', 'modified', 'unchanged')),
  start_date TEXT,
  end_date TEXT,
  is_billable INTEGER DEFAULT 1,
  is_aspirational INTEGER DEFAULT 0,
  base_assignment_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (scenario_id) REFERENCES scenarios(id),
  FOREIGN KEY (person_id) REFERENCES people(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (role_id) REFERENCES roles(id),
  FOREIGN KEY (phase_id) REFERENCES project_phases(id)
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL,
  old_values TEXT,
  new_values TEXT,
  changed_fields TEXT,
  changed_by TEXT,
  changed_at TEXT NOT NULL,
  request_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  comment TEXT,
  parent_id TEXT,
  is_undo INTEGER DEFAULT 0
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(project_type_id);
CREATE INDEX IF NOT EXISTS idx_projects_location ON projects(location_id);
CREATE INDEX IF NOT EXISTS idx_assignments_person ON project_assignments(person_id);
CREATE INDEX IF NOT EXISTS idx_assignments_project ON project_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_assignments_scenario ON project_assignments(scenario_id);

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_audit_table_record ON audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_changed_by ON audit_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_audit_changed_at ON audit_log(changed_at);
CREATE INDEX IF NOT EXISTS idx_audit_request_id ON audit_log(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_parent_id ON audit_log(parent_id);

-- Note: scenario_type and parent_scenario_id are now included in the CREATE TABLE statement above
-- These ALTER TABLE statements are kept for backward compatibility but will be no-ops if table already has these columns

-- Scenario merge conflicts table
CREATE TABLE IF NOT EXISTS scenario_merge_conflicts (
  id TEXT PRIMARY KEY,
  source_scenario_id TEXT NOT NULL,
  target_scenario_id TEXT NOT NULL,
  conflict_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  source_data TEXT,
  target_data TEXT,
  resolution TEXT DEFAULT 'pending',
  resolved_data TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (source_scenario_id) REFERENCES scenarios(id),
  FOREIGN KEY (target_scenario_id) REFERENCES scenarios(id),
  FOREIGN KEY (resolved_by) REFERENCES people(id)
);

CREATE INDEX IF NOT EXISTS idx_merge_conflicts_source ON scenario_merge_conflicts(source_scenario_id);
CREATE INDEX IF NOT EXISTS idx_merge_conflicts_target ON scenario_merge_conflicts(target_scenario_id);
CREATE INDEX IF NOT EXISTS idx_merge_conflicts_resolution ON scenario_merge_conflicts(resolution);

-- Add project_phase_dependencies table
CREATE TABLE IF NOT EXISTS project_phase_dependencies (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  predecessor_phase_timeline_id TEXT NOT NULL,
  successor_phase_timeline_id TEXT NOT NULL,
  dependency_type TEXT NOT NULL DEFAULT 'FS' CHECK(dependency_type IN ('FS', 'SS', 'FF', 'SF')),
  lag_days INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (predecessor_phase_timeline_id) REFERENCES project_phases_timeline(id) ON DELETE CASCADE,
  FOREIGN KEY (successor_phase_timeline_id) REFERENCES project_phases_timeline(id) ON DELETE CASCADE,
  UNIQUE(predecessor_phase_timeline_id, successor_phase_timeline_id)
);

-- Add indexes for project_phase_dependencies
CREATE INDEX IF NOT EXISTS idx_phase_dependencies_project ON project_phase_dependencies(project_id);
CREATE INDEX IF NOT EXISTS idx_phase_dependencies_predecessor ON project_phase_dependencies(predecessor_phase_timeline_id);
CREATE INDEX IF NOT EXISTS idx_phase_dependencies_successor ON project_phase_dependencies(successor_phase_timeline_id);

-- Add resource_templates table needed for views
CREATE TABLE IF NOT EXISTS resource_templates (
  id TEXT PRIMARY KEY,
  project_type_id TEXT NOT NULL,
  project_sub_type_id TEXT,
  phase_id TEXT,
  role_id TEXT NOT NULL,
  allocation_percentage REAL NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_type_id) REFERENCES project_types(id) ON DELETE CASCADE,
  FOREIGN KEY (project_sub_type_id) REFERENCES project_sub_types(id) ON DELETE CASCADE,
  FOREIGN KEY (phase_id) REFERENCES project_phases(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- Add person_availability_overrides table
CREATE TABLE IF NOT EXISTS person_availability_overrides (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  availability_percentage INTEGER NOT NULL DEFAULT 100,
  reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (person_id) REFERENCES people(id)
);

-- Add scenario_assignments_view for scenario queries
CREATE VIEW IF NOT EXISTS scenario_assignments_view AS
SELECT
  spa.id,
  spa.scenario_id,
  spa.project_id,
  spa.person_id,
  spa.role_id,
  spa.phase_id,
  spa.allocation_percentage,
  spa.assignment_date_mode,
  spa.change_type,
  spa.start_date,
  spa.end_date,
  p.name as person_name,
  r.name as role_name,
  proj.name as project_name,
  -- Compute start and end dates based on assignment mode
  CASE
    WHEN spa.assignment_date_mode = 'fixed' THEN spa.start_date
    WHEN spa.assignment_date_mode = 'project' THEN COALESCE(sp.aspiration_start, proj.aspiration_start)
    WHEN spa.assignment_date_mode = 'phase' THEN sph.start_date
    ELSE spa.start_date
  END as computed_start_date,
  CASE
    WHEN spa.assignment_date_mode = 'fixed' THEN spa.end_date
    WHEN spa.assignment_date_mode = 'project' THEN COALESCE(sp.aspiration_finish, proj.aspiration_finish)
    WHEN spa.assignment_date_mode = 'phase' THEN sph.end_date
    ELSE spa.end_date
  END as computed_end_date,
  spa.created_at,
  spa.updated_at
FROM scenario_project_assignments spa
INNER JOIN people p ON spa.person_id = p.id
INNER JOIN roles r ON spa.role_id = r.id
INNER JOIN projects proj ON spa.project_id = proj.id
LEFT JOIN scenario_projects sp ON spa.scenario_id = sp.scenario_id AND spa.project_id = sp.project_id
LEFT JOIN scenario_project_phases sph ON spa.scenario_id = sph.scenario_id AND spa.phase_id = sph.phase_id AND spa.project_id = sph.project_id;

-- Add capacity_gaps_view for ReportingController tests
CREATE VIEW IF NOT EXISTS capacity_gaps_view AS
WITH role_capacity AS (
  SELECT 
    r.id as role_id,
    r.name as role_name,
    COUNT(DISTINCT p.id) as people_count,
    COALESCE(SUM(
      CASE 
        WHEN p.worker_type = 'FTE' THEN 1.0
        WHEN p.worker_type IN ('Contractor', 'Consultant') THEN 0.8
        ELSE 1.0
      END
    ), 0) as total_capacity_fte,
    COALESCE(SUM(p.default_hours_per_day), 0) as total_capacity_hours,
    0 as people_with_reduced_availability
  FROM roles r
  LEFT JOIN person_roles pr ON r.id = pr.role_id
  LEFT JOIN people p ON pr.person_id = p.id
  GROUP BY r.id, r.name
),
role_demand AS (
  SELECT 
    r.id as role_id,
    COALESCE(SUM(spa.allocation_percentage / 100.0), 0) as total_demand_fte,
    COALESCE(SUM((spa.allocation_percentage / 100.0) * 8.0), 0) as total_demand_hours
  FROM roles r
  LEFT JOIN scenario_project_assignments spa ON r.id = spa.role_id
  LEFT JOIN scenarios s ON spa.scenario_id = s.id
  WHERE s.status = 'active'
  AND spa.start_date <= date('now')
  AND spa.end_date >= date('now')
  GROUP BY r.id
)
SELECT 
  rc.role_id,
  rc.role_name,
  rc.people_count,
  rc.total_capacity_fte,
  rc.total_capacity_hours,
  rd.total_demand_fte,
  rd.total_demand_hours,
  (rc.total_capacity_fte - rd.total_demand_fte) as capacity_gap_fte,
  (rc.total_capacity_hours - rd.total_demand_hours) as capacity_gap_hours,
  rc.people_with_reduced_availability,
  CASE 
    WHEN rc.total_capacity_fte = 0 THEN 
      CASE WHEN rd.total_demand_fte > 0 THEN 999 ELSE 0 END
    ELSE (rd.total_demand_fte / rc.total_capacity_fte) * 100
  END as utilization_percentage
FROM role_capacity rc
LEFT JOIN role_demand rd ON rc.role_id = rd.role_id
ORDER BY rc.role_name;

-- Add project_health_view for ReportingController tests
CREATE VIEW IF NOT EXISTS project_health_view AS
SELECT 
  p.id,
  p.name,
  p.priority,
  p.aspiration_start,
  p.aspiration_finish,
  CASE 
    WHEN p.aspiration_finish < date('now') THEN 'overdue'
    WHEN p.aspiration_finish < date('now', '+30 days') THEN 'at_risk'
    ELSE 'on_track'
  END as health_status,
  0 as missing_roles,
  -- Add allocation percentage fields
  COALESCE((
    SELECT SUM(spa.allocation_percentage / 100.0)
    FROM scenario_project_assignments spa
    JOIN scenarios s ON spa.scenario_id = s.id
    WHERE spa.project_id = p.id
    AND s.status = 'active'
    AND spa.start_date <= date('now')
    AND spa.end_date >= date('now')
  ), 0) as total_allocation_percentage,
  -- Determine allocation health
  CASE 
    WHEN COALESCE((
      SELECT SUM(spa.allocation_percentage / 100.0)
      FROM scenario_project_assignments spa
      JOIN scenarios s ON spa.scenario_id = s.id
      WHERE spa.project_id = p.id
      AND s.status = 'active'
      AND spa.start_date <= date('now')
      AND spa.end_date >= date('now')
    ), 0) = 0 THEN 'UNDER_ALLOCATED'
    WHEN COALESCE((
      SELECT SUM(spa.allocation_percentage / 100.0)
      FROM scenario_project_assignments spa
      JOIN scenarios s ON spa.scenario_id = s.id
      WHERE spa.project_id = p.id
      AND s.status = 'active'
      AND spa.start_date <= date('now')
      AND spa.end_date >= date('now')
    ), 0) < 0.8 THEN 'UNDER_ALLOCATED'
    ELSE 'OK'
  END as allocation_health
FROM projects p;

-- Add assignments_view for AssignmentsController conflict checking
CREATE VIEW IF NOT EXISTS assignments_view AS
SELECT 
  spa.id,
  spa.scenario_id,
  spa.project_id,
  spa.person_id,
  spa.role_id,
  spa.phase_id,
  spa.allocation_percentage,
  spa.assignment_date_mode,
  spa.start_date,
  spa.end_date,
  -- Compute dates based on project/phase if needed
  COALESCE(spa.start_date, p.aspiration_start) as computed_start_date,
  COALESCE(spa.end_date, p.aspiration_finish) as computed_end_date,
  spa.created_at,
  spa.updated_at
FROM scenario_project_assignments spa
INNER JOIN projects p ON spa.project_id = p.id;

-- =============================================================================
-- Git Sync Tables (Feature: 001-git-sync-integration)
-- =============================================================================

-- Sync operations tracking table
CREATE TABLE IF NOT EXISTS sync_operations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('pull', 'push', 'merge', 'clone')),
  status TEXT NOT NULL CHECK(status IN ('in-progress', 'completed', 'completed-with-errors', 'failed', 'conflict')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  user_id TEXT,
  branch TEXT DEFAULT 'main',
  commit_sha TEXT,
  conflict_count INTEGER DEFAULT 0,
  files_changed INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES people(id)
);

-- Conflicts table for tracking Git sync conflicts
CREATE TABLE IF NOT EXISTS conflicts (
  id TEXT PRIMARY KEY,
  sync_operation_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('project', 'person', 'assignment', 'project_phase', 'scenario')),
  entity_id TEXT NOT NULL,
  entity_name TEXT,
  field TEXT NOT NULL,
  base_value TEXT,
  local_value TEXT,
  remote_value TEXT,
  resolution_status TEXT NOT NULL DEFAULT 'pending' CHECK(resolution_status IN ('pending', 'resolved', 'skipped')),
  resolved_value TEXT,
  resolved_at TEXT,
  resolved_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (sync_operation_id) REFERENCES sync_operations(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by) REFERENCES people(id)
);

-- Branch metadata table
CREATE TABLE IF NOT EXISTS branch_metadata (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  base_branch TEXT DEFAULT 'main',
  is_active INTEGER DEFAULT 1,
  last_sync_at TEXT,
  scenario_id TEXT,
  FOREIGN KEY (created_by) REFERENCES people(id),
  FOREIGN KEY (scenario_id) REFERENCES scenarios(id)
);

-- Offline queue for pending changes when network unavailable
CREATE TABLE IF NOT EXISTS offline_queue (
  id TEXT PRIMARY KEY,
  operation_type TEXT NOT NULL CHECK(operation_type IN ('create', 'update', 'delete')),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_data TEXT NOT NULL,
  queued_at TEXT NOT NULL DEFAULT (datetime('now')),
  retry_count INTEGER DEFAULT 0,
  last_retry_at TEXT,
  error_message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  user_id TEXT,
  FOREIGN KEY (user_id) REFERENCES people(id)
);

-- Git sync indexes
CREATE INDEX IF NOT EXISTS idx_sync_operations_status ON sync_operations(status);
CREATE INDEX IF NOT EXISTS idx_sync_operations_type ON sync_operations(type);
CREATE INDEX IF NOT EXISTS idx_sync_operations_user ON sync_operations(user_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_sync_op ON conflicts(sync_operation_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_status ON conflicts(resolution_status);
CREATE INDEX IF NOT EXISTS idx_conflicts_entity ON conflicts(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_branch_metadata_name ON branch_metadata(name);
CREATE INDEX IF NOT EXISTS idx_offline_queue_status ON offline_queue(status);
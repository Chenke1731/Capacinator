-- Test database schema for integration tests
-- Based on baseline schema migration

-- 1. Locations table
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Project types table
CREATE TABLE IF NOT EXISTS project_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color_code TEXT DEFAULT '#000000',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Project phases table
CREATE TABLE IF NOT EXISTS project_phases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  order_index INTEGER NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Roles table
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  external_id TEXT UNIQUE,
  description TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. People table
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  primary_role_id TEXT,
  worker_type TEXT DEFAULT 'FTE' CHECK(worker_type IN ('FTE', 'Contractor', 'Consultant')),
  supervisor_id TEXT,
  default_availability_percentage REAL DEFAULT 100,
  default_hours_per_day REAL DEFAULT 8,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (primary_role_id) REFERENCES roles(id),
  FOREIGN KEY (supervisor_id) REFERENCES people(id)
);

-- 6. Projects table
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_type_id TEXT,
  location_id TEXT,
  priority INTEGER NOT NULL DEFAULT 5,
  description TEXT,
  include_in_demand INTEGER DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_type_id) REFERENCES project_types(id),
  FOREIGN KEY (location_id) REFERENCES locations(id)
);

-- 7. Person roles table
CREATE TABLE IF NOT EXISTS person_roles (
  person_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  proficiency_level TEXT DEFAULT 'Intermediate',
  PRIMARY KEY (person_id, role_id),
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- 8. Role planners table
CREATE TABLE IF NOT EXISTS role_planners (
  role_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  is_primary INTEGER DEFAULT 0,
  can_allocate_resources INTEGER DEFAULT 1,
  can_approve_assignments INTEGER DEFAULT 1,
  can_modify_standard_allocations INTEGER DEFAULT 0,
  PRIMARY KEY (role_id, person_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

-- 9. Project planners table
CREATE TABLE IF NOT EXISTS project_planners (
  project_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  permission_level TEXT DEFAULT 'PLANNER' CHECK(permission_level IN ('VIEWER', 'PLANNER', 'OWNER')),
  PRIMARY KEY (project_id, person_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

-- 10. Project phases timeline table
CREATE TABLE IF NOT EXISTS project_phases_timeline (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  phase_id TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, phase_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (phase_id) REFERENCES project_phases(id)
);

-- 11. Demand overrides table
CREATE TABLE IF NOT EXISTS demand_overrides (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  demand_hours REAL NOT NULL,
  reason TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- 12. Project assignments table
CREATE TABLE IF NOT EXISTS project_assignments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  allocation_percentage REAL NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- 13. Person availability overrides table
CREATE TABLE IF NOT EXISTS person_availability_overrides (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  availability_percentage REAL NOT NULL,
  override_type TEXT DEFAULT 'OTHER' CHECK(override_type IN ('VACATION', 'SICK_LEAVE', 'TRAINING', 'CONFERENCE', 'PARENTAL_LEAVE', 'REDUCED_HOURS', 'SABBATICAL', 'UNAVAILABLE', 'OTHER')),
  reason TEXT,
  is_approved INTEGER DEFAULT 0,
  approved_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

-- 14. Standard allocations table
CREATE TABLE IF NOT EXISTS standard_allocations (
  id TEXT PRIMARY KEY,
  project_type_id TEXT NOT NULL,
  phase_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  allocation_percentage REAL NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_type_id, phase_id, role_id),
  FOREIGN KEY (project_type_id) REFERENCES project_types(id) ON DELETE CASCADE,
  FOREIGN KEY (phase_id) REFERENCES project_phases(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- 15. Supervisor delegations table
CREATE TABLE IF NOT EXISTS supervisor_delegations (
  id TEXT PRIMARY KEY,
  supervisor_id TEXT NOT NULL,
  delegate_id TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supervisor_id) REFERENCES people(id) ON DELETE CASCADE,
  FOREIGN KEY (delegate_id) REFERENCES people(id) ON DELETE CASCADE
);

import { Knex } from 'knex';

/**
 * Consolidated E2E Test Data Seed
 * 
 * Creates a comprehensive set of test data for E2E testing including:
 * - Multiple utilization scenarios (over-utilized, under-utilized, optimal)
 * - Various project types and phases
 * - Different assignment patterns
 * - Multiple locations and roles
 */
export async function seed(knex: Knex): Promise<void> {
  console.log('🌱 Seeding consolidated E2E test data...');
  
  // Set up dates for timeline - Use relative dates from today
  // This ensures our test data is always relevant to the current date
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  const nextTwoWeeks = new Date(today);
  nextTwoWeeks.setDate(today.getDate() + 14);
  const nextMonth = new Date(today);
  nextMonth.setMonth(today.getMonth() + 1);
  const nextTwoMonths = new Date(today);
  nextTwoMonths.setMonth(today.getMonth() + 2);
  const nextThreeMonths = new Date(today);
  nextThreeMonths.setMonth(today.getMonth() + 3);
  
  // First check if we have any existing people
  const existingPeople = await knex('people').select('id', 'name').limit(10);
  console.log('Existing people before clear:', existingPeople.map(p => p.name).join(', '));
  
  // Clear existing data in reverse order of dependencies
  await knex.raw('PRAGMA foreign_keys = OFF');
  
  const tablesToClear = [
    'scenario_merge_conflicts',
    'scenario_project_assignments', 
    'scenario_project_phases',
    'scenario_projects',
    'scenarios',
    'project_assignments',
    'project_phases_timeline',
    'project_demands',
    'person_availability_overrides',
    'person_roles',
    'resource_templates',
    'projects',
    'people',
    'project_phases',
    'project_sub_types',
    'project_types',
    'roles',
    'locations'
  ];
  
  for (const table of tablesToClear) {
    try {
      await knex(table).del();
    } catch {
      // Table might not exist, continue
    }
  }
  
  await knex.raw('PRAGMA foreign_keys = ON');
  
  // Verify tables are cleared
  const peopleAfterClear = await knex('people').count('* as count').first();
  console.log(`People count after clear: ${peopleAfterClear?.count || 0}`);
  
  // Seed locations
  await knex('locations').insert([
    {
      id: 'loc-e2e-office',
      name: 'E2E Main Office',
      description: 'Primary office for E2E testing',
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'loc-e2e-remote', 
      name: 'E2E Remote',
      description: 'Remote work location for E2E testing',
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);
  
  // Seed roles with various specializations
  await knex('roles').insert([
    {
      id: 'role-e2e-dev',
      name: 'E2E Developer',
      description: 'Software developer for E2E tests',
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'role-e2e-designer',
      name: 'E2E Designer',
      description: 'UI/UX designer for E2E tests',
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'role-e2e-manager',
      name: 'E2E Manager',
      description: 'Project manager for E2E tests',
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'role-e2e-qa',
      name: 'E2E QA Engineer',
      description: 'Quality assurance for E2E tests',
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);
  
  // Seed project types. Names MUST start with a category prefix from
  // client/src/lib/projectCategories.ts (需求交付/问题单支持/项目事务/零星事项)
  // — the Projects page tabs filter by categoryOfTypeName(), and a name that
  // matches no category leaves the e2e requirements table permanently empty.
  await knex('project_types').insert([
    {
      id: 'ptype-e2e-web',
      name: '需求交付-E2E-Web',
      description: 'Web development projects for E2E testing',
      color_code: '#3B82F6',
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'ptype-e2e-mobile',
      name: '需求交付-E2E-Mobile',
      description: 'Mobile development projects for E2E testing',
      color_code: '#10B981',
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);
  
  // Seed project sub-types
  await knex('project_sub_types').insert([
    {
      id: 'psub-e2e-webapp',
      name: 'E2E Web Application',
      project_type_id: 'ptype-e2e-web',
      is_active: true,
      color_code: '#60A5FA',
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'psub-e2e-mobileapp',
      name: 'E2E Mobile App',
      project_type_id: 'ptype-e2e-mobile',
      is_active: true,
      color_code: '#34D399',
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);
  
  // Seed project phases
  await knex('project_phases').insert([
    {
      id: 'phase-e2e-planning',
      name: 'E2E Planning',
      order_index: 1,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'phase-e2e-design',
      name: 'E2E Design',
      order_index: 2,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'phase-e2e-development',
      name: 'E2E Development',
      order_index: 3,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'phase-e2e-testing',
      name: 'E2E Testing',
      order_index: 4,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'phase-e2e-deployment',
      name: 'E2E Deployment',
      order_index: 5,
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);
  
  // Seed people with primary roles first
  const peopleData = [
    // Over-utilized person (will have 120% utilization)
    {
      id: 'person-e2e-overutil',
      name: 'E2E Over Utilized',
      email: 'e2e-overutil@example.com',
      worker_type: 'FTE',
      location_id: 'loc-e2e-office',
      default_availability_percentage: 100,
      default_hours_per_day: 8,
      created_at: new Date(),
      updated_at: new Date()
    },
    // Normal utilization person (will have 80% utilization)
    {
      id: 'person-e2e-normal',
      name: 'E2E Normal Utilized',
      email: 'e2e-normal@example.com',
      worker_type: 'FTE',
      location_id: 'loc-e2e-office',
      default_availability_percentage: 100,
      default_hours_per_day: 8,
      created_at: new Date(),
      updated_at: new Date()
    },
    // Under-utilized person (will have 40% utilization)
    {
      id: 'person-e2e-underutil',
      name: 'E2E Under Utilized',
      email: 'e2e-underutil@example.com',
      worker_type: 'FTE',
      location_id: 'loc-e2e-remote',
      default_availability_percentage: 100,
      default_hours_per_day: 8,
      created_at: new Date(),
      updated_at: new Date()
    },
    // Zero utilization person (no assignments)
    {
      id: 'person-e2e-zero',
      name: 'E2E Zero Utilized',
      email: 'e2e-zero@example.com',
      worker_type: 'Contractor',
      location_id: 'loc-e2e-remote',
      default_availability_percentage: 80,
      default_hours_per_day: 6,
      created_at: new Date(),
      updated_at: new Date()
    }
  ];
  
  // First insert people without primary_person_role_id
  await knex('people').insert(peopleData);
  
  // Then create person_roles
  await knex('person_roles').insert([
    {
      id: 'person-role-e2e-overutil',
      person_id: 'person-e2e-overutil',
      role_id: 'role-e2e-dev',
      proficiency_level: 5,
      is_primary: true
    },
    {
      id: 'person-role-e2e-normal',
      person_id: 'person-e2e-normal',
      role_id: 'role-e2e-designer',
      proficiency_level: 4,
      is_primary: true
    },
    {
      id: 'person-role-e2e-underutil',
      person_id: 'person-e2e-underutil',
      role_id: 'role-e2e-manager',
      proficiency_level: 4,
      is_primary: true
    },
    {
      id: 'person-role-e2e-zero',
      person_id: 'person-e2e-zero',
      role_id: 'role-e2e-qa',
      proficiency_level: 3,
      is_primary: true
    }
  ]);
  
  // Update people with primary_person_role_id
  await knex('people').where('id', 'person-e2e-overutil')
    .update({ primary_person_role_id: 'person-role-e2e-overutil' });
  await knex('people').where('id', 'person-e2e-normal')
    .update({ primary_person_role_id: 'person-role-e2e-normal' });
  await knex('people').where('id', 'person-e2e-underutil')
    .update({ primary_person_role_id: 'person-role-e2e-underutil' });
  await knex('people').where('id', 'person-e2e-zero')
    .update({ primary_person_role_id: 'person-role-e2e-zero' });
  
  // Seed projects with different priorities
  await knex('projects').insert([
    {
      id: 'project-e2e-critical',
      name: 'E2E Critical Project',
      project_type_id: 'ptype-e2e-web',
      project_sub_type_id: 'psub-e2e-webapp',
      location_id: 'loc-e2e-office',
      priority: 1,
      description: 'High priority E2E test project',
      aspiration_start: today.toISOString().split('T')[0],
      aspiration_finish: nextThreeMonths.toISOString().split('T')[0],
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'project-e2e-normal',
      name: 'E2E Normal Project',
      project_type_id: 'ptype-e2e-mobile',
      project_sub_type_id: 'psub-e2e-mobileapp',
      location_id: 'loc-e2e-office',
      priority: 2,
      description: 'Medium priority E2E test project',
      aspiration_start: today.toISOString().split('T')[0],
      aspiration_finish: nextThreeMonths.toISOString().split('T')[0],
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'project-e2e-backlog',
      name: 'E2E Backlog Project',
      project_type_id: 'ptype-e2e-web',
      project_sub_type_id: 'psub-e2e-webapp',
      location_id: 'loc-e2e-remote',
      priority: 3,
      description: 'Low priority E2E test project',
      aspiration_start: nextMonth.toISOString().split('T')[0],
      aspiration_finish: nextThreeMonths.toISOString().split('T')[0],
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);
  
  // Dates have already been set up at the beginning of the function
  
  // Seed project phases timeline
  await knex('project_phases_timeline').insert([
    // Critical project - all phases
    {
      id: 'timeline-e2e-critical-1',
      project_id: 'project-e2e-critical',
      phase_id: 'phase-e2e-planning',
      start_date: today.toISOString().split('T')[0],
      end_date: nextWeek.toISOString().split('T')[0],
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'timeline-e2e-critical-2',
      project_id: 'project-e2e-critical',
      phase_id: 'phase-e2e-development',
      start_date: nextWeek.toISOString().split('T')[0],
      end_date: nextMonth.toISOString().split('T')[0],
      created_at: new Date(),
      updated_at: new Date()
    },
    // Normal project - in development
    {
      id: 'timeline-e2e-normal-1',
      project_id: 'project-e2e-normal',
      phase_id: 'phase-e2e-development',
      start_date: today.toISOString().split('T')[0],
      end_date: nextThreeMonths.toISOString().split('T')[0],
      created_at: new Date(),
      updated_at: new Date()
    },
    // Backlog project - future start
    {
      id: 'timeline-e2e-backlog-1',
      project_id: 'project-e2e-backlog',
      phase_id: 'phase-e2e-planning',
      start_date: nextMonth.toISOString().split('T')[0],
      end_date: nextThreeMonths.toISOString().split('T')[0],
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);
  
  // Seed person availability overrides
  await knex('person_availability_overrides').insert([
    {
      id: 'avail-e2e-001',
      person_id: 'person-e2e-overutil',
      start_date: today.toISOString().split('T')[0],
      end_date: nextThreeMonths.toISOString().split('T')[0],
      availability_percentage: 100,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'avail-e2e-002',
      person_id: 'person-e2e-normal',
      start_date: today.toISOString().split('T')[0],
      end_date: nextThreeMonths.toISOString().split('T')[0],
      availability_percentage: 100,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'avail-e2e-003',
      person_id: 'person-e2e-underutil',
      start_date: today.toISOString().split('T')[0],
      end_date: nextThreeMonths.toISOString().split('T')[0],
      availability_percentage: 100,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'avail-e2e-004',
      person_id: 'person-e2e-zero',
      start_date: today.toISOString().split('T')[0],
      end_date: nextThreeMonths.toISOString().split('T')[0],
      availability_percentage: 80,
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);
  
  // Seed baseline scenario BEFORE assignments to satisfy foreign key constraints
  await knex('scenarios').insert([
    {
      id: 'baseline-0000-0000-0000-000000000000',
      name: 'Baseline',
      description: 'Baseline scenario for E2E testing',
      parent_scenario_id: null,
      created_by: 'person-e2e-normal',
      status: 'active',
      scenario_type: 'baseline',
      branch_point: null,
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);
  
  // Seed scenario project assignments to create various utilization scenarios
  await knex('scenario_project_assignments').insert([
    // Over-utilized person: 80% + 40% = 120%
    {
      id: 'assign-e2e-overutil-1',
      project_id: 'project-e2e-critical',
      person_id: 'person-e2e-overutil',
      role_id: 'role-e2e-dev',
      start_date: today.toISOString().split('T')[0],
      end_date: nextThreeMonths.toISOString().split('T')[0],
      allocation_percentage: 80,
      scenario_id: 'baseline-0000-0000-0000-000000000000',
      assignment_date_mode: 'fixed',
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'assign-e2e-overutil-2',
      project_id: 'project-e2e-normal',
      person_id: 'person-e2e-overutil',
      role_id: 'role-e2e-dev',
      start_date: today.toISOString().split('T')[0],
      end_date: nextThreeMonths.toISOString().split('T')[0],
      allocation_percentage: 40,
      scenario_id: 'baseline-0000-0000-0000-000000000000',
      assignment_date_mode: 'fixed',
      created_at: new Date(),
      updated_at: new Date()
    },
    // Normal utilization: 80%
    {
      id: 'assign-e2e-normal-1',
      project_id: 'project-e2e-critical',
      person_id: 'person-e2e-normal',
      role_id: 'role-e2e-designer',
      start_date: today.toISOString().split('T')[0],
      end_date: nextThreeMonths.toISOString().split('T')[0],
      allocation_percentage: 80,
      scenario_id: 'baseline-0000-0000-0000-000000000000',
      assignment_date_mode: 'fixed',
      created_at: new Date(),
      updated_at: new Date()
    },
    // Under-utilized: 40%
    {
      id: 'assign-e2e-underutil-1',
      project_id: 'project-e2e-normal',
      person_id: 'person-e2e-underutil',
      role_id: 'role-e2e-manager',
      start_date: today.toISOString().split('T')[0],
      end_date: nextThreeMonths.toISOString().split('T')[0],
      allocation_percentage: 40,
      scenario_id: 'baseline-0000-0000-0000-000000000000',
      assignment_date_mode: 'fixed',
      created_at: new Date(),
      updated_at: new Date()
    }
    // person-e2e-zero has no assignments (0% utilization)
  ]);
  
  // Seed resource templates for automatic assignments
  await knex('resource_templates').insert([
    {
      id: 'template-e2e-001',
      project_sub_type_id: 'psub-e2e-webapp',
      phase_id: 'phase-e2e-development',
      role_id: 'role-e2e-dev',
      allocation_percentage: 80.0,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'template-e2e-002',
      project_sub_type_id: 'psub-e2e-webapp',
      phase_id: 'phase-e2e-testing',
      role_id: 'role-e2e-qa',
      allocation_percentage: 60.0,
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);

  // Materialize project allocations for the seed projects (mirroring the
  // resource templates above). The Smart Assignment modal's project list is
  // gated on projectsWithDemand — which reads project_allocation_overrides —
  // and the template→allocation initialize chain is dormant product surface
  // (no caller, and its template lookup keys on project_type_id while
  // templates carry project_sub_type_id). Without these rows the manual
  // assignment combobox is permanently disabled in the e2e world.
  await knex('project_allocation_overrides').insert([
    {
      id: 'pao-e2e-critical-dev',
      project_id: 'project-e2e-critical',
      phase_id: 'phase-e2e-development',
      role_id: 'role-e2e-dev',
      allocation_percentage: 80.0,
      is_inherited: true,
      template_id: 'template-e2e-001',
      notes: 'Inherited from resource template (seed)',
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 'pao-e2e-critical-qa',
      project_id: 'project-e2e-critical',
      phase_id: 'phase-e2e-testing',
      role_id: 'role-e2e-qa',
      allocation_percentage: 60.0,
      is_inherited: true,
      template_id: 'template-e2e-002',
      notes: 'Inherited from resource template (seed)',
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);

  console.log('✅ Consolidated E2E test data seeded successfully');
  console.log('📊 Utilization scenarios created:');
  console.log('   - E2E Over Utilized: 120% (80% + 40%)');
  console.log('   - E2E Normal Utilized: 80%');
  console.log('   - E2E Under Utilized: 40%');
  console.log('   - E2E Zero Utilized: 0%');
}
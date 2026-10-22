import { describe, test, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import { getAuditedDb } from '../../src/server/database/index.js';
import { setupTestApp } from '../utils/test-app-setup.js';

describe.skip('Import/Export Workflow Integration', () => {
  let app: any;
  let db: any;
  let testScenarioId: string;
  let testDataIds: any = {};

  beforeAll(async () => {
    app = await setupTestApp();
    db = getAuditedDb();
  });

  beforeEach(async () => {
    // Create test scenario and base data
    const [scenarioResult] = await db('scenarios').insert({
      name: 'Integration Test Scenario',
      description: 'Test scenario for integration testing',
      scenario_type: 'baseline',
      created_by: 'test-user',
      status: 'active'
    }).returning('id');
    
    testScenarioId = scenarioResult.id || scenarioResult;

    // Create test data
    const [locationResult] = await db('locations').insert({
      name: 'Test Location',
      description: 'Integration test location'
    }).returning('id');
    testDataIds.locationId = locationResult.id || locationResult;

    const [projectTypeResult] = await db('project_types').insert({
      name: 'Integration Test Type',
      description: 'Test project type'
    }).returning('id');
    testDataIds.projectTypeId = projectTypeResult.id || projectTypeResult;

    const [roleResult] = await db('roles').insert({
      name: 'Integration Test Role',
      description: 'Test role'
    }).returning('id');
    testDataIds.roleId = roleResult.id || roleResult;

    const [personResult] = await db('people').insert({
      name: 'Test Person',
      email: 'test@integration.com',
      primary_person_role_id: testDataIds.roleId,
      worker_type: 'FTE',
      default_availability_percentage: 100,
      default_hours_per_day: 8
    }).returning('id');
    testDataIds.personId = personResult.id || personResult;

    const [projectResult] = await db('projects').insert({
      name: 'Integration Test Project',
      project_type_id: testDataIds.projectTypeId,
      project_sub_type_id: 'test-sub-type-1',
      location_id: testDataIds.locationId,
      priority: 2,
      description: 'Test project for integration testing',
      include_in_demand: true
    }).returning('id');
    testDataIds.projectId = projectResult.id || projectResult;
  });

  afterEach(async () => {
    // Clean up test data
    await db('scenarios').where('id', testScenarioId).del();
    await db('projects').where('id', testDataIds.projectId).del();
    await db('people').where('id', testDataIds.personId).del();
    await db('roles').where('id', testDataIds.roleId).del();
    await db('project_types').where('id', testDataIds.projectTypeId).del();
    await db('locations').where('id', testDataIds.locationId).del();
  });

  afterAll(async () => {
    if (db) {
      await db.destroy();
    }
  });

  describe('Complete Export → Edit → Import Workflow', () => {
    it('should export scenario data, allow editing, and re-import successfully', async () => {
      // Step 1: Export scenario data
      const exportResponse = await request(app)
        .get('/api/import/export/scenario')
        .query({
          scenarioId: testScenarioId,
          includeAssignments: 'true',
          includePhases: 'true'
        })
        .expect(200);

      expect(exportResponse.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(exportResponse.headers['content-disposition']).toContain('attachment');

      // Step 2: Read and verify exported Excel file
      const exportedBuffer = exportResponse.body as Buffer;
      expect(exportedBuffer.length).toBeGreaterThan(0);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(exportedBuffer);

      // Verify worksheets exist
      const worksheetNames = workbook.worksheets.map(ws => ws.name);
      expect(worksheetNames).toContain('Projects');
      expect(worksheetNames).toContain('Rosters');
      expect(worksheetNames).toContain('Export Metadata');

      // Step 3: Verify exported data content
      const projectsSheet = workbook.getWorksheet('Projects');
      expect(projectsSheet).toBeDefined();

      let foundTestProject = false;
      projectsSheet!.eachRow((row, rowNumber) => {
        if (rowNumber > 1) { // Skip header
          const projectName = row.getCell(1).value?.toString();
          if (projectName === 'Integration Test Project') {
            foundTestProject = true;
            expect(row.getCell(2).value).toBe('Integration Test Type');
            expect(row.getCell(4).value).toBe('Test Location');
          }
        }
      });
      expect(foundTestProject).toBe(true);

      // Step 4: Modify the exported data (simulate user editing)
      const modifiedWorkbook = new ExcelJS.Workbook();
      await modifiedWorkbook.xlsx.load(exportedBuffer);
      
      const modifiedProjectsSheet = modifiedWorkbook.getWorksheet('Projects');
      modifiedProjectsSheet!.addRow({
        name: 'New Imported Project',
        project_type: 'Integration Test Type',
        location: 'Test Location',
        priority: 1,
        description: 'This project was added during editing'
      });

      // Save modified workbook to temporary file
      const tempFilePath = path.join(__dirname, '../temp', `modified-export-${Date.now()}.xlsx`);
      await fs.mkdir(path.dirname(tempFilePath), { recursive: true });
      await modifiedWorkbook.xlsx.writeFile(tempFilePath);

      // Step 5: Re-import the modified data
      const importResponse = await request(app)
        .post('/api/import/excel')
        .attach('excelFile', tempFilePath)
        .field('clearExisting', 'false')
        .field('useV2', 'false')
        .expect(200);

      expect(importResponse.body.success).toBe(true);
      expect(importResponse.body.imported.projects).toBeGreaterThan(0);

      // Step 6: Verify the new project was imported
      const importedProjects = await db('projects')
        .where('name', 'New Imported Project')
        .first();

      expect(importedProjects).toBeDefined();
      expect(importedProjects.description).toBe('This project was added during editing');

      // Cleanup temporary file
      await fs.unlink(tempFilePath);

      // Cleanup imported project
      await db('projects').where('id', importedProjects.id).del();
    });

    it('should handle export with selective options and re-import correctly', async () => {
      // Export without assignments and phases
      const exportResponse = await request(app)
        .get('/api/import/export/scenario')
        .query({
          scenarioId: testScenarioId,
          includeAssignments: 'false',
          includePhases: 'false'
        })
        .expect(200);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(exportResponse.body);

      // Should not have assignment or phase worksheets
      const worksheetNames = workbook.worksheets.map(ws => ws.name);
      expect(worksheetNames).not.toContain('Project Assignments');
      expect(worksheetNames).not.toContain('Project Phase Timelines');
      expect(worksheetNames).toContain('Projects');
      expect(worksheetNames).toContain('Rosters');
    });
  });

  describe('Template Download → Fill → Import Workflow', () => {
    it('should download template, fill with data, and import successfully', async () => {
      // Step 1: Download blank template
      const templateResponse = await request(app)
        .get('/api/import/export/template')
        .query({
          templateType: 'complete',
          includeAssignments: 'true',
          includePhases: 'true'
        })
        .expect(200);

      expect(templateResponse.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      // Step 2: Load template and verify structure
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(templateResponse.body);

      const worksheetNames = workbook.worksheets.map(ws => ws.name);
      expect(worksheetNames).toContain('Template Info');
      expect(worksheetNames).toContain('Projects');
      expect(worksheetNames).toContain('Rosters');
      expect(worksheetNames).toContain('Instructions');

      // Step 3: Fill template with new data
      const projectsSheet = workbook.getWorksheet('Projects');
      
      // Clear sample data (keep headers)
      const rowCount = projectsSheet!.rowCount;
      for (let i = rowCount; i > 1; i--) {
        projectsSheet!.spliceRows(i, 1);
      }

      // Add new project data
      projectsSheet!.addRow({
        name: 'Template Test Project',
        project_type: 'Integration Test Type',
        location: 'Test Location',
        priority: 3,
        description: 'Project created from template',
        owner: 'Template User'
      });

      const rostersSheet = workbook.getWorksheet('Rosters');
      // Clear sample data
      const rosterRowCount = rostersSheet!.rowCount;
      for (let i = rosterRowCount; i > 1; i--) {
        rostersSheet!.spliceRows(i, 1);
      }

      // Add new person data
      rostersSheet!.addRow({
        name: 'Template Test Person',
        email: 'template@test.com',
        primary_role: 'Integration Test Role',
        worker_type: 'FTE',
        availability: 100,
        hours_per_day: 8
      });

      // Step 4: Save filled template
      const filledTemplatePath = path.join(__dirname, '../temp', `filled-template-${Date.now()}.xlsx`);
      await fs.mkdir(path.dirname(filledTemplatePath), { recursive: true });
      await workbook.xlsx.writeFile(filledTemplatePath);

      // Step 5: Import filled template
      const importResponse = await request(app)
        .post('/api/import/excel')
        .attach('excelFile', filledTemplatePath)
        .field('clearExisting', 'false')
        .field('autoCreateMissingRoles', 'false')
        .field('autoCreateMissingLocations', 'false')
        .expect(200);

      expect(importResponse.body.success).toBe(true);
      expect(importResponse.body.imported.projects).toBe(1);
      expect(importResponse.body.imported.people).toBe(1);

      // Step 6: Verify imported data
      const importedProject = await db('projects')
        .where('name', 'Template Test Project')
        .first();

      expect(importedProject).toBeDefined();
      expect(importedProject.description).toBe('Project created from template');

      const importedPerson = await db('people')
        .where('name', 'Template Test Person')
        .first();

      expect(importedPerson).toBeDefined();
      expect(importedPerson.email).toBe('template@test.com');

      // Cleanup
      await fs.unlink(filledTemplatePath);
      await db('projects').where('id', importedProject.id).del();
      await db('people').where('id', importedPerson.id).del();
    });

    it('should generate different template types correctly', async () => {
      // Test basic template
      const basicResponse = await request(app)
        .get('/api/import/export/template')
        .query({ templateType: 'basic' })
        .expect(200);

      // Test minimal template
      const minimalResponse = await request(app)
        .get('/api/import/export/template')
        .query({ templateType: 'minimal' })
        .expect(200);

      // Both should return Excel files
      expect(basicResponse.headers['content-type']).toContain('spreadsheetml.sheet');
      expect(minimalResponse.headers['content-type']).toContain('spreadsheetml.sheet');

      // Verify different filenames
      expect(basicResponse.headers['content-disposition']).toContain('basic');
      expect(minimalResponse.headers['content-disposition']).toContain('minimal');
    });
  });

  describe('Import Analysis (Dry-Run) Workflow', () => {
    it('should analyze import without making changes', async () => {
      // Create a test Excel file with conflicting data
      const workbook = new ExcelJS.Workbook();
      
      const projectsSheet = workbook.addWorksheet('Projects');
      projectsSheet.columns = [
        { header: 'Project Name', key: 'name', width: 30 },
        { header: 'Project Type', key: 'type', width: 20 },
        { header: 'Location', key: 'location', width: 20 },
        { header: 'Priority', key: 'priority', width: 15 }
      ];

      // Add existing project (should be detected as update)
      projectsSheet.addRow({
        name: 'Integration Test Project',
        type: 'Integration Test Type',
        location: 'Test Location',
        priority: 1 // Different priority
      });

      // Add new project (should be detected as create)
      projectsSheet.addRow({
        name: 'Brand New Project',
        type: 'Integration Test Type',
        location: 'Test Location',
        priority: 2
      });

      const rostersSheet = workbook.addWorksheet('Rosters');
      rostersSheet.columns = [
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Primary Role', key: 'role', width: 20 }
      ];

      // Add person with conflicting email
      rostersSheet.addRow({
        name: 'Different Person',
        email: 'test@integration.com', // Same email as existing person
        role: 'Integration Test Role'
      });

      const analysisFilePath = path.join(__dirname, '../temp', `analysis-${Date.now()}.xlsx`);
      await fs.mkdir(path.dirname(analysisFilePath), { recursive: true });
      await workbook.xlsx.writeFile(analysisFilePath);

      // Perform analysis
      const analysisResponse = await request(app)
        .post('/api/import/analyze')
        .attach('excelFile', analysisFilePath)
        .field('clearExisting', 'false')
        .expect(200);

      expect(analysisResponse.body.success).toBe(true);
      expect(analysisResponse.body.analysis).toBeDefined();

      const analysis = analysisResponse.body.analysis;

      // Verify analysis results
      expect(analysis.summary.wouldCreate.projects).toBe(1); // Brand New Project
      expect(analysis.summary.wouldUpdate.projects).toBe(1); // Integration Test Project
      expect(analysis.conflicts.length).toBeGreaterThan(0); // Email conflict

      // Verify risk assessment
      expect(analysis.riskAssessment.level).toBe('high'); // Due to conflicts
      expect(analysis.riskAssessment.factors).toContain(expect.stringContaining('conflicts detected'));

      // Verify no actual changes were made
      const projectCount = await db('projects').count('* as count').first();
      const peopleCount = await db('people').count('* as count').first();
      
      // Counts should remain the same (only test data)
      expect(parseInt(projectCount.count, 10)).toBe(1);
      expect(parseInt(peopleCount.count, 10)).toBe(1);

      // Cleanup
      await fs.unlink(analysisFilePath);
    });

    it('should provide accurate risk assessment for different scenarios', async () => {
      // Test high-risk scenario (clear existing + conflicts)
      const highRiskWorkbook = new ExcelJS.Workbook();
      const projectsSheet = highRiskWorkbook.addWorksheet('Projects');
      projectsSheet.columns = [
        { header: 'Project Name', key: 'name' },
        { header: 'Project Type', key: 'type' },
        { header: 'Location', key: 'location' },
        { header: 'Priority', key: 'priority' }
      ];
      projectsSheet.addRow({
        name: 'Risk Test Project',
        type: 'Non-existent Type', // Should cause error
        location: 'Non-existent Location',
        priority: 1
      });

      const riskFilePath = path.join(__dirname, '../temp', `risk-analysis-${Date.now()}.xlsx`);
      await fs.mkdir(path.dirname(riskFilePath), { recursive: true });
      await highRiskWorkbook.xlsx.writeFile(riskFilePath);

      const riskAnalysisResponse = await request(app)
        .post('/api/import/analyze')
        .attach('excelFile', riskFilePath)
        .field('clearExisting', 'true') // High risk operation
        .expect(200);

      const riskAnalysis = riskAnalysisResponse.body.analysis;
      expect(riskAnalysis.riskAssessment.level).toBe('high');
      expect(riskAnalysis.riskAssessment.factors).toContain(expect.stringContaining('existing records will be deleted'));

      await fs.unlink(riskFilePath);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle corrupted Excel files gracefully', async () => {
      const corruptedFilePath = path.join(__dirname, '../temp', `corrupted-${Date.now()}.xlsx`);
      await fs.mkdir(path.dirname(corruptedFilePath), { recursive: true });
      await fs.writeFile(corruptedFilePath, 'This is not an Excel file');

      const response = await request(app)
        .post('/api/import/analyze')
        .attach('excelFile', corruptedFilePath)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Import analysis failed');

      await fs.unlink(corruptedFilePath);
    });

    it('should handle missing scenario for export', async () => {
      const response = await request(app)
        .get('/api/import/export/scenario')
        .query({ scenarioId: 'non-existent-scenario' })
        .expect(404);

      expect(response.body.error).toBe('Scenario not found');
    });

    it('should validate file types for import', async () => {
      const textFilePath = path.join(__dirname, '../temp', `invalid-${Date.now()}.txt`);
      await fs.mkdir(path.dirname(textFilePath), { recursive: true });
      await fs.writeFile(textFilePath, 'This is a text file');

      const response = await request(app)
        .post('/api/import/validate')
        .attach('excelFile', textFilePath)
        .expect(400);

      expect(response.body.valid).toBe(false);
      expect(response.body.errors[0].message).toContain('Excel file');

      await fs.unlink(textFilePath);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle moderately large datasets efficiently', async () => {
      // Create workbook with moderate amount of data
      const workbook = new ExcelJS.Workbook();
      
      const projectsSheet = workbook.addWorksheet('Projects');
      projectsSheet.columns = [
        { header: 'Project Name', key: 'name' },
        { header: 'Project Type', key: 'type' },
        { header: 'Location', key: 'location' },
        { header: 'Priority', key: 'priority' }
      ];

      // Add 50 projects
      for (let i = 1; i <= 50; i++) {
        projectsSheet.addRow({
          name: `Performance Test Project ${i}`,
          type: 'Integration Test Type',
          location: 'Test Location',
          priority: (i % 3) + 1
        });
      }

      const rostersSheet = workbook.addWorksheet('Rosters');
      rostersSheet.columns = [
        { header: 'Name', key: 'name' },
        { header: 'Email', key: 'email' },
        { header: 'Primary Role', key: 'role' }
      ];

      // Add 50 people
      for (let i = 1; i <= 50; i++) {
        rostersSheet.addRow({
          name: `Performance Test Person ${i}`,
          email: `perf${i}@test.com`,
          role: 'Integration Test Role'
        });
      }

      const perfFilePath = path.join(__dirname, '../temp', `performance-${Date.now()}.xlsx`);
      await fs.mkdir(path.dirname(perfFilePath), { recursive: true });
      await workbook.xlsx.writeFile(perfFilePath);

      // Measure analysis time
      const startTime = Date.now();
      
      const analysisResponse = await request(app)
        .post('/api/import/analyze')
        .attach('excelFile', perfFilePath)
        .expect(200);

      const analysisTime = Date.now() - startTime;
      
      expect(analysisResponse.body.success).toBe(true);
      expect(analysisResponse.body.analysis.summary.wouldCreate.projects).toBe(50);
      expect(analysisResponse.body.analysis.summary.wouldCreate.people).toBe(50);
      
      // Analysis should complete within reasonable time (5 seconds)
      expect(analysisTime).toBeLessThan(5000);

      await fs.unlink(perfFilePath);
    });
  });
});
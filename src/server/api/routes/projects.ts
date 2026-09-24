import { Router } from 'express';
import { ProjectsController } from '../controllers/ProjectsController.js';

const router = Router();
const controller = new ProjectsController();

// Test data cleanup (for e2e tests) - must come before /:id route
router.delete('/test-data', controller.deleteTestData);

// Project CRUD operations
router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

// Project-specific endpoints
router.get('/:id/demands', controller.getDemands);
router.get('/:id/timeline', controller.getProjectTimeline);

// Phase template validation endpoints
router.post('/:id/phases/validate-updates', controller.validatePhaseUpdates);
router.post('/:id/phases/validate-custom', controller.validateCustomPhase);
router.get('/:id/template-compliance', controller.getTemplateCompliance);

// Custom phase management endpoints
router.post('/:id/phases/custom', controller.addCustomPhase);
router.put('/:id/phases/:phaseTimelineId', controller.updateProjectPhase);
router.delete('/:id/phases/:phaseTimelineId', controller.deleteProjectPhase);

// Dashboard/reporting endpoints
router.get('/dashboard/health', controller.getHealth);

export default router;
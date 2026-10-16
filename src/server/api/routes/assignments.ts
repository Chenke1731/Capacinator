import { Router } from 'express';
import { AssignmentsController } from '../controllers/AssignmentsController.js';
import { registerTestDataCleanupRoute } from './register-test-data-route.js';

const router = Router();
const controller = new AssignmentsController();

// Test data cleanup (for e2e tests) - must come before /:id route.
// 生产不注册（物理缺席），见 register-test-data-route.ts
registerTestDataCleanupRoute(router, controller.deleteTestData);

// Assignment CRUD operations
router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

// Bulk operations
router.post('/bulk', controller.bulkAssign);

// Conflict detection
router.get('/conflicts/:person_id', controller.getConflicts);

// Assignment suggestions
router.get('/suggestions', controller.getSuggestions);

// Person timeline
router.get('/timeline/:person_id', controller.getTimeline);

export default router;
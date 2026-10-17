import { Router } from 'express';
import { ScenariosController } from '../controllers/ScenariosController.js';

const router = Router();
const scenariosController = new ScenariosController();

// GET /api/scenarios - Get all scenarios
router.get('/', scenariosController.getAll.bind(scenariosController));

// POST /api/scenarios - Create new scenario (branch)
router.post('/', scenariosController.create.bind(scenariosController));

// GET /api/scenarios/:id - Get specific scenario
router.get('/:id', scenariosController.getById.bind(scenariosController));

// PUT /api/scenarios/:id - Update scenario
router.put('/:id', scenariosController.update.bind(scenariosController));

// DELETE /api/scenarios/:id - Delete scenario
router.delete('/:id', scenariosController.delete.bind(scenariosController));

// GET /api/scenarios/:id/assignments - Get scenario assignments
router.get('/:id/assignments', scenariosController.getAssignments.bind(scenariosController));

// POST /api/scenarios/:id/assignments - Add/update assignment in scenario
router.post('/:id/assignments', scenariosController.upsertAssignment.bind(scenariosController));

// DELETE /api/scenarios/:id/assignments/:assignmentId - Remove assignment from scenario
router.delete('/:id/assignments/:assignmentId', scenariosController.removeAssignment.bind(scenariosController));

// GET /api/scenarios/:id/compare - Compare scenarios
router.get('/:id/compare', scenariosController.compare.bind(scenariosController));

// POST /api/scenarios/:id/merge - Merge scenario back to parent
router.post('/:id/merge', scenariosController.merge.bind(scenariosController));

// GET /api/scenarios/:id/merge-conflicts - Manual merge conflict list
router.get('/:id/merge-conflicts', scenariosController.getMergeConflicts.bind(scenariosController));

// PATCH /api/scenarios/:id/merge-conflicts/:conflictId - Resolve one conflict
router.patch('/:id/merge-conflicts/:conflictId', scenariosController.resolveMergeConflict.bind(scenariosController));

export default router;
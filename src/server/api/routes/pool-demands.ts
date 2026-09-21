import { Router } from 'express';
import { PoolDemandsController } from '../controllers/PoolDemandsController.js';

const router = Router();
const controller = new PoolDemandsController();

// Pool placeholders for a project (role-side quantity demand, no person)
router.get('/project/:projectId', (req, res) => controller.listByProject(req, res));

// Create a pool placeholder
router.post('/project/:projectId', (req, res) => controller.create(req, res));

// Update (headcount / dates / notes / status incl. marking named)
router.patch('/:id', (req, res) => controller.update(req, res));

// Delete a pool placeholder
router.delete('/:id', (req, res) => controller.delete(req, res));

export default router;

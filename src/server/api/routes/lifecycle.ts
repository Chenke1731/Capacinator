import { Router } from 'express';
import { LifecycleController } from '../controllers/LifecycleController.js';

const router = Router();
const controller = new LifecycleController();

// State machine metadata + event history
router.get('/:id/lifecycle', (req, res) => controller.getLifecycle(req, res));

// Guarded transition (side effects per LifecycleService)
router.post('/:id/lifecycle/transition', (req, res) => controller.transition(req, res));

// Field-only updates (AR number / iteration label)
router.patch('/:id/lifecycle', (req, res) => controller.updateFields(req, res));

export default router;

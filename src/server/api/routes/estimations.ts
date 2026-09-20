import { Router } from 'express';
import { EstimationController } from '../controllers/EstimationController.js';

const router = Router();
const controller = new EstimationController();

// Estimation history for a project (newest first, latest flagged is_current)
router.get('/project/:projectId', (req, res) => controller.listByProject(req, res));

// Create a new estimation record (append-only history)
router.post('/project/:projectId', (req, res) => controller.create(req, res));

// Post-delivery backfill of actuals (calibration)
router.post('/:id/backfill', (req, res) => controller.backfill(req, res));

// Deadline feasibility check (body may override deadline/start/conversion)
router.post('/:id/check', (req, res) => controller.check(req, res));

export default router;

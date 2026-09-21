import { Router } from 'express';
import { DesignEstimationController } from '../controllers/DesignEstimationController.js';

const router = Router();
const controller = new DesignEstimationController();

// Design rough-estimate history for a project (newest first, latest flagged is_current)
router.get('/project/:projectId', (req, res) => controller.listByProject(req, res));

// Create a new rough design estimate (append-only history)
router.post('/project/:projectId', (req, res) => controller.create(req, res));

// Post-completion backfill of actual design effort
router.post('/:id/backfill', (req, res) => controller.backfill(req, res));

// Design-side deadline check (deadline defaults to 设计 phase end date)
router.post('/:id/check', (req, res) => controller.check(req, res));

export default router;

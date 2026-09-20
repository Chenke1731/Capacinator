import { Router } from 'express';
import { RolesController } from '../controllers/RolesController.js';

const router = Router();
const controller = new RolesController();

// Expertise levels endpoint
// NOTE: handlers are wrapped in arrow functions so prototype methods keep
// their controller `this` context (passing them bare loses it and crashes
// on this.executeQuery).
router.get('/expertise-levels', (req, res) => controller.getExpertiseLevels(req, res));

// Role CRUD operations
router.get('/', controller.getAll);
router.get('/:id', (req, res) => controller.getById(req, res));
router.post('/', (req, res) => controller.create(req, res));
router.put('/:id', (req, res) => controller.update(req, res));
router.delete('/:id', (req, res) => controller.delete(req, res));

// Role planner management
router.post('/:id/planners', (req, res) => controller.addPlanner(req, res));
router.delete('/:id/planners/:plannerId', (req, res) => controller.removePlanner(req, res));

// Dashboard/reporting endpoints
router.get('/dashboard/capacity-gaps', (req, res) => controller.getCapacityGaps(req, res));

export default router;

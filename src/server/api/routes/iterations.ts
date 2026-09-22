import { Router } from 'express';
import { IterationsController } from '../controllers/IterationsController.js';

const router = Router();
const controller = new IterationsController();

router.get('/', (req, res) => controller.getAll(req, res));
router.post('/', (req, res) => controller.create(req, res));
router.put('/:id', (req, res) => controller.update(req, res));
router.delete('/:id', (req, res) => controller.remove(req, res));

export default router;

import { Router } from 'express';
import { SimpleController } from '../controllers/SimpleController.js';

// Software component management (066): controlled structural dimension
// answering "which part of the software" — feeds demand/workload
// analytics. Plain CRUD via SimpleController, same pattern as locations.
const router = Router();
const controller = new SimpleController('components');

router.get('/', (req, res) => controller.getAll(req, res));
router.get('/:id', (req, res) => controller.getById(req, res));
router.post('/', (req, res) => controller.create(req, res));
router.put('/:id', (req, res) => controller.update(req, res));
router.delete('/:id', (req, res) => controller.delete(req, res));

export default router;

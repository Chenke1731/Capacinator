import { Router } from 'express';
import { DemandIntakeController } from '../controllers/DemandIntakeController.js';

/**
 * /api/intake —— I01 需求收件箱路由（2026-11-10 设计稿 §4）。
 *
 * 注意注册顺序：/counts 必须在 /:id 之前（express 按注册顺序匹配，
 * 否则 "counts" 被当成 intake id）。
 */
const router = Router();
const controller = new DemandIntakeController();

router.post('/', (req, res) => controller.create(req, res));
router.post('/batch', (req, res) => controller.createBatch(req, res));
router.get('/', (req, res) => controller.getAll(req, res));
router.get('/counts', (req, res) => controller.counts(req, res));
router.get('/:id', (req, res) => controller.getById(req, res));
router.patch('/:id', (req, res) => controller.update(req, res));
router.post('/:id/convert', (req, res) => controller.convert(req, res));
router.post('/:id/reject', (req, res) => controller.reject(req, res));
router.delete('/:id', (req, res) => controller.remove(req, res));

export default router;

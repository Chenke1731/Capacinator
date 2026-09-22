import { Router } from 'express';
import { ActualInvestmentsController } from '../controllers/ActualInvestmentsController.js';

const router = Router();
const controller = new ActualInvestmentsController();

// 实投入月帐: 行+实时计划值
router.get('/project/:projectId', (req, res) => controller.list(req, res));
// 月末快照(只补缺失/刷新旧快照,不覆盖 manual)
router.post('/project/:projectId/snapshot', (req, res) => controller.snapshot(req, res));
// 主管改写
router.put('/project/:projectId', (req, res) => controller.setManual(req, res));
// 清除某月
router.delete('/project/:projectId/:month', (req, res) => controller.remove(req, res));

export default router;

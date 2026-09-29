import { Router } from 'express';
import { ReportingController } from '../controllers/ReportingController.js';

const router = Router();
const controller = new ReportingController();

// Dashboard and reporting endpoints
router.get('/dashboard', controller.getDashboard);
router.get('/test', controller.getTest);
router.get('/capacity', controller.getCapacityReport);
router.get('/demand', controller.getDemandReport);
router.get('/utilization', controller.getUtilizationReport);
router.get('/gaps', controller.getGapsAnalysis);
router.get('/projects', controller.getProjectReport);
router.get('/by-component', controller.getComponentReport);
router.get('/timeline', controller.getTimelineReport);

export default router;
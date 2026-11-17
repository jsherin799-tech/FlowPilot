import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth.middleware';
import { generateQAScenarios, chat, getProjectSummary, summarizeSprint } from '../controllers/ai.controller';

const router = Router();

router.use(authenticateJWT);

router.post('/generate-test-scenarios', generateQAScenarios);
router.post('/qa-scenarios',     generateQAScenarios);
router.post('/chat',             chat);
router.post('/project-summary',  getProjectSummary);
router.post('/summarize-sprint', summarizeSprint);

export default router;
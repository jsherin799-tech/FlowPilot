import { Router } from 'express';
const router = Router();
router.post('/generate-qa', (req, res) => res.json({ success: true, scenarios: [] }));
export default router;
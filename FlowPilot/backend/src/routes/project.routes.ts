import { Router } from 'express';
const router = Router();
router.get('/', (req, res) => res.json({ success: true, projects: [] }));
export default router;
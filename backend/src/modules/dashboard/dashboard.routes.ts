import { Router } from 'express';
import { authenticate, resolveTenant } from '../../middleware/auth.js';
import * as c from './dashboard.controller.js';

const router = Router();
router.use(authenticate, resolveTenant);
router.get('/', c.getDashboard);

export default router;

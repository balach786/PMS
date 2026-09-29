import { Router } from 'express';
import { authenticate, authorize, resolveTenant } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { openShiftSchema, closeShiftSchema } from '../auth/auth.validation.js';
import * as c from './shifts.controller.js';

const router = Router();
router.use(authenticate, resolveTenant);

router.get('/', c.listShifts);
router.get('/current', c.currentShift);
router.post('/open', authorize('admin', 'manager', 'cashier'), validate(openShiftSchema), c.openShift);
router.post('/:id/close', authorize('admin', 'manager', 'cashier'), validate(closeShiftSchema), c.closeShift);
router.get('/:id', c.getShift);

export default router;

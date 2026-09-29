import { Router } from 'express';
import { authenticate, resolveTenant } from '../../middleware/auth.js';
import * as c from './notifications.controller.js';

const router = Router();

// Every pump user may read their own alerts; nothing here crosses tenants
// because resolveTenant binds each request to one pump database.
router.use(authenticate, resolveTenant);

router.get('/', c.listNotifications);
router.post('/dismiss', c.dismissNotifications);
router.delete('/dismissed', c.clearDismissed);

export default router;

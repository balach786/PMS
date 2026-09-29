import { Router } from 'express';
import { authenticate, authorize, resolveTenant } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { createUserSchema, updateUserSchema } from '../auth/auth.validation.js';
import * as c from './users.controller.js';

const router = Router();
router.use(authenticate, resolveTenant, authorize('admin'));

router.get('/', c.listUsers);
router.post('/', validate(createUserSchema), c.createUser);
router.patch('/:id', validate(updateUserSchema), c.updateUser);
router.delete('/:id', c.deleteUser);

export default router;

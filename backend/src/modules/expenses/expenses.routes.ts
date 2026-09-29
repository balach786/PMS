import { Router } from 'express';
import { authenticate, authorize, resolveTenant } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { expenseSchema } from '../auth/auth.validation.js';
import * as c from './expenses.controller.js';

const router = Router();
router.use(authenticate, resolveTenant);

router.get('/categories', authorize('admin', 'manager'), c.expenseCategories);
router.get('/', authorize('admin', 'manager'), c.listExpenses);
router.post('/', authorize('admin', 'manager'), validate(expenseSchema), c.createExpense);
router.patch('/:id', authorize('admin', 'manager'), validate(expenseSchema.partial()), c.updateExpense);
router.post('/:id/void', authorize('admin', 'manager'), c.voidExpense);
router.delete('/:id', authorize('admin'), c.deleteExpense);

export default router;

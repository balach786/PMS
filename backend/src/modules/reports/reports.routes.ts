import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { authenticate, resolveTenant } from '../../middleware/auth.js';
import { ApiError } from '../../utils/http.js';
import * as c from './reports.controller.js';

const router = Router();
router.use(authenticate, resolveTenant);

/** Cashiers get the basic operational reports only. */
const CASHIER_REPORTS = ['sales', 'shifts', 'customers'];

function guardReport(req: Request, _res: Response, next: NextFunction): void {
  const type = String(req.params.type || '');
  if (!type) return next(ApiError.badRequest('Report type is required.'));
  if (req.auth!.role === 'cashier' && !CASHIER_REPORTS.includes(type)) {
    return next(ApiError.forbidden('Cashiers can view the sales, shift and customer reports only.'));
  }
  next();
}

router.get('/types', c.reportTypes);
router.get('/:type', guardReport, c.getReport);
router.get('/:type/export', guardReport, c.exportReport);

export default router;

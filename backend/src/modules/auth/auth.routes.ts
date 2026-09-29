import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env.js';

const RATE_LIMIT_OFF = Number.MAX_SAFE_INTEGER;
import * as controller from './auth.controller.js';
import { validate } from '../../middleware/validate.js';
import { authenticate, authorize, resolveTenant } from '../../middleware/auth.js';
import { registerSchema, loginSchema, changePasswordSchema } from './auth.validation.js';

const router = Router();

/** Brute force protection on the authentication endpoints. */
const disabled = env.rateLimit.disabled;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: disabled ? RATE_LIMIT_OFF : env.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in a few minutes.', code: 'RATE_LIMITED' },
  skipSuccessfulRequests: true,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: disabled ? RATE_LIMIT_OFF : env.rateLimit.registerMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many accounts created from this network. Please try again later.', code: 'RATE_LIMITED' },
});

router.post('/register', registerLimiter, validate(registerSchema), controller.register);
router.post('/login', authLimiter, validate(loginSchema), controller.login);
router.post('/logout', authenticate, controller.logout);
router.get('/me', authenticate, resolveTenant, controller.me);
router.post(
  '/change-password',
  authenticate,
  resolveTenant,
  validate(changePasswordSchema),
  controller.changePassword,
);
router.get('/permissions', authenticate, resolveTenant, authorize('admin', 'manager', 'cashier'), (req, res) => {
  res.json({ success: true, data: { role: req.auth!.role, permissions: controller.permissionsFor(req.auth!.role) } });
});

export default router;

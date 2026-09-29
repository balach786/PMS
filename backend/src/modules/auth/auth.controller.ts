import type { Response } from 'express';
import { connectMaster } from '../../db/master.js';
import { generateUniqueDatabaseName, getTenant, getTenantConnection } from '../../db/tenant.js';
import { ApiError } from '../../utils/http.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/http.js';
import { comparePassword, hashPassword, normaliseEmail, passwordIssues } from '../../utils/password.js';
import { signAccessToken } from '../../utils/jwt.js';
import { slugify, uniqueSlug } from '../../utils/slug.js';
import type { AuthPrincipal } from '../../types/express.js';

const DEFAULT_FUELS = [
  { name: 'Petrol', code: 'PET', sellingPrice: 280, purchasePrice: 268, minStockAlert: 2000, capacity: 30000, color: '#B69952' },
  { name: 'Diesel', code: 'DSL', sellingPrice: 285, purchasePrice: 272, minStockAlert: 2000, capacity: 40000, color: '#1D3B61' },
  { name: 'Hi-Octane', code: 'HOC', sellingPrice: 305, purchasePrice: 290, minStockAlert: 1000, capacity: 15000, color: '#639C14' },
];

export const register = asyncHandler(async (req, res) => {
  const { businessName, ownerName, email, phone, address, password } = req.body as {
    businessName: string;
    ownerName: string;
    email: string;
    phone: string;
    address?: string;
    password: string;
  };

  const issues = passwordIssues(password);
  if (issues.length) throw ApiError.validation(issues[0]);

  const { Pump, Subscription } = await connectMaster();
  const normalised = normaliseEmail(email);

  const existing = await Pump.findOne({
    $or: [{ email: normalised }, { loginEmails: normalised }],
  }).lean();
  if (existing) {
    throw ApiError.conflict('An account with this email already exists. Try signing in instead.');
  }

  const slug = await uniqueSlug(slugify(businessName), async (s) => !!(await Pump.findOne({ slug: s }).lean()));
  const databaseName = await generateUniqueDatabaseName(
    businessName,
    async (name) => !!(await Pump.findOne({ databaseName: name }).lean()),
  );

  // 1. create the pump (SaaS level) record
  const pump = await Pump.create({
    name: businessName.trim(),
    slug,
    databaseName,
    ownerName: ownerName.trim(),
    email: normalised,
    phone: phone?.trim(),
    address: address?.trim() || '',
    status: 'active',
    subscriptionStatus: 'trial',
    plan: 'starter',
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    loginEmails: [normalised],
  });

  // 2. subscription record
  await Subscription.create({
    pumpId: pump._id,
    plan: 'starter',
    status: 'trial',
    amount: 0,
    currency: 'PKR',
    startDate: new Date(),
    endDate: pump.trialEndsAt,
  });

  // 3. provision the pump's OWN database (creates collections + indexes)
  const models = await getTenant(databaseName);

  // 4. seed configurable default fuel types
  await models.Fuel.insertMany(
    DEFAULT_FUELS.map((f) => ({ ...f, currentStock: 0, unit: 'L', status: 'active' })),
  );

  // 5. create the first admin user inside the pump database
  const passwordHash = await hashPassword(password);
  const user = await models.User.create({
    name: ownerName.trim(),
    email: normalised,
    passwordHash,
    role: 'admin',
    active: true,
  });

  const principal: AuthPrincipal = {
    userId: String(user._id),
    pumpId: String(pump._id),
    databaseName,
    pumpName: pump.name,
    pumpSlug: pump.slug,
    role: 'admin',
    name: user.name,
    email: user.email,
  };

  return res.status(201).json(
    ok(
      {
        token: signAccessToken(principal),
        user: { id: String(user._id), name: user.name, email: user.email, role: user.role },
        pump: {
          id: String(pump._id),
          name: pump.name,
          slug: pump.slug,
          databaseName: pump.databaseName,
          subscriptionStatus: pump.subscriptionStatus,
        },
      },
      `Welcome to BK Petrol Pump Manager, ${pump.name} is ready to use.`,
    ),
  );
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const normalised = normaliseEmail(email);

  const { Pump } = await connectMaster();

  // Resolve which pump this identity belongs to. `loginEmails` is an index
  // maintained by the platform - the pump database is NEVER taken from the
  // client.
  let pumps = await Pump.find({ loginEmails: normalised, status: 'active' }).lean();
  if (!pumps.length) {
    pumps = await Pump.find({ email: normalised, status: 'active' }).lean();
  }

  if (!pumps.length) {
    throw ApiError.unauthorized('No account found with these credentials.');
  }

  let matched: {
    user: { _id: unknown; name: string; email: string; role: 'admin' | 'manager' | 'cashier'; active: boolean };
    pump: (typeof pumps)[number];
    databaseName: string;
  } | null = null;

  for (const pump of pumps) {
    const models = await getTenant(pump.databaseName);
    const user = await models.User.findOne({ email: normalised }).select('+passwordHash').lean();
    if (!user) continue;
    const valid = await comparePassword(password, user.passwordHash);
    if (valid) {
      matched = {
        user: user as never,
        pump,
        databaseName: pump.databaseName,
      };
      break;
    }
  }

  if (!matched) throw ApiError.unauthorized('Incorrect email or password.');

  const { user, pump, databaseName } = matched;
  if (!user.active) throw ApiError.forbidden('This user account has been deactivated.');

  const models = await getTenant(databaseName);
  await models.User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

  const principal: AuthPrincipal = {
    userId: String(user._id),
    pumpId: String(pump._id),
    databaseName,
    pumpName: pump.name,
    pumpSlug: pump.slug,
    role: user.role,
    name: user.name,
    email: user.email,
  };

  return res.json(
    ok({
      token: signAccessToken(principal),
      user: { id: String(user._id), name: user.name, email: user.email, role: user.role },
      pump: {
        id: String(pump._id),
        name: pump.name,
        slug: pump.slug,
        databaseName: pump.databaseName,
        subscriptionStatus: pump.subscriptionStatus,
        status: pump.status,
      },
    }),
  );
});

export const me = asyncHandler(async (req, res) => {
  const auth = req.auth!;
  const models = req.tenant!;
  const user = await models.User.findById(auth.userId).lean();
  if (!user) throw ApiError.unauthorized();

  return res.json(
    ok({
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone ?? '',
        active: user.active,
        lastLoginAt: user.lastLoginAt ?? null,
      },
      pump: {
        id: auth.pumpId,
        name: auth.pumpName,
        slug: auth.pumpSlug,
        databaseName: auth.databaseName,
      },
      permissions: permissionsFor(user.role),
    }),
  );
});

export const logout = asyncHandler(async (_req, res: Response) => {
  // JWTs are stateless: the client discards the token. Endpoint exists so the
  // flow is explicit (and can later record audit/refresh-token revocation).
  return res.json(ok({ loggedOut: true }, 'Signed out successfully.'));
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  const models = req.tenant!;
  const user = await models.User.findById(req.auth!.userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found.');

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) throw ApiError.badRequest('Your current password is incorrect.');

  const issues = passwordIssues(newPassword);
  if (issues.length) throw ApiError.validation(issues[0]);

  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  return res.json(ok({ changed: true }, 'Password updated successfully.'));
});

export function permissionsFor(role: string) {
  switch (role) {
    case 'admin':
      return {
        dashboard: true,
        sales: true,
        fuels: true,
        stock: true,
        shifts: true,
        customers: true,
        expenses: true,
        purchases: true,
        suppliers: true,
        reports: true,
        users: true,
        settings: true,
        manageAllShifts: true,
      };
    case 'manager':
      return {
        dashboard: true,
        sales: true,
        fuels: true,
        stock: true,
        shifts: true,
        customers: true,
        expenses: true,
        purchases: true,
        suppliers: true,
        reports: true,
        users: false,
        settings: false,
        manageAllShifts: true,
      };
    default:
      return {
        dashboard: true,
        sales: true,
        fuels: false,
        stock: false,
        shifts: true,
        customers: true,
        expenses: false,
        purchases: false,
        suppliers: false,
        reports: true,
        users: false,
        settings: false,
        manageAllShifts: false,
      };
  }
}

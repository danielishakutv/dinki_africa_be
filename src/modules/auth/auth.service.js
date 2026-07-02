const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../../config/database');
const redis = require('../../config/redis');
const config = require('../../config');
const AppError = require('../../utils/AppError');
const { nanoid } = require('nanoid');
const emailService = require('../../services/emailService');
const { createNotification } = require('../notifications/notifications.service');
const { normalizeNigerianPhone } = require('../../utils/phone');

const SALT_ROUNDS = 12;
const OTP_EXPIRY = 5 * 60; // 5 minutes in seconds
const RESET_TOKEN_EXPIRY = 60 * 60; // 1 hour in seconds
const VERIFY_GRACE_DAYS = 7; // days a new account can use the app before verifying

function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

async function generateRefreshToken(userId) {
  const raw = crypto.randomBytes(40).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await db('refresh_tokens').insert({
    user_id: userId,
    token_hash: hash,
    expires_at: expiresAt,
  });

  return raw;
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getInitials(name) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function verifyDeadlineFromNow() {
  return new Date(Date.now() + VERIFY_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

// The user object the SPA relies on for routing, nav and the pending-tasks banner.
function publicUser(user, tailorProfile) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatar_url: user.avatar_url,
    initials: user.initials,
    avatar_color: user.avatar_color,
    onboarding_completed: user.onboarding_completed,
    email_verified: user.email_verified,
    phone_verified: user.phone_verified,
    verify_deadline: user.verify_deadline,
    storefront_slug: tailorProfile?.storefront_slug || null,
    // Mirror the getProfile shape so the pending-tasks banner reads the correct
    // storefront-setup state immediately after login/signup (no refresh needed).
    tailor_profile: tailorProfile ? {
      storefront_slug: tailorProfile.storefront_slug,
      storefront_setup_completed: tailorProfile.storefront_setup_completed || false,
    } : undefined,
  };
}

// Persist a fresh verification token and email the link. No-op without an email
// or when already verified. Non-blocking send — a mail hiccup never blocks auth.
async function sendEmailVerification(user) {
  if (!user.email || user.email_verified) return;
  const token = crypto.randomBytes(32).toString('hex');
  await db('users').where({ id: user.id }).update({ email_verify_token: token });
  const link = `${config.frontendUrl}/verify-email?token=${token}`;
  emailService.sendVerificationEmail(user.email, link, user.name)
    .catch((err) => console.error('[EMAIL] verification send failed:', err.message));
  if (config.env !== 'production') console.log(`[DEV] Verify link for ${user.email}: ${link}`);
}

// Auto-login: issue access + refresh tokens right after signup/activate — no OTP
// gate. The 7-day grace + verification banner handle email confirmation later.
async function issueSession(user) {
  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);
  let tailorProfile = null;
  if (user.role === 'tailor') {
    tailorProfile = await db('tailor_profiles').where({ user_id: user.id }).first();
  }
  return { accessToken, refreshToken, user: publicUser(user, tailorProfile) };
}

/**
 * Apply a referral code to a freshly-created user.
 *
 * Silent no-op if the code doesn't resolve or points at the referee
 * themselves — we never throw, never surface "invalid code" errors to the
 * caller. That keeps the signup flow simple AND prevents referral-code
 * enumeration through the signup endpoint.
 */
async function applyReferral({ newUserId, newUserEmail, code }) {
  const referrer = await db('users')
    .where({ referral_code: code, is_active: true })
    .first('id', 'name');

  if (!referrer) return null;          // unknown code — silently skip
  if (referrer.id === newUserId) return null; // defensive, shouldn't happen

  await db.transaction(async (trx) => {
    await trx('users')
      .where({ id: newUserId })
      .update({ referred_by: referrer.id });

    await trx('referrals').insert({
      referrer_id: referrer.id,
      referee_id: newUserId,
      referee_email: newUserEmail,
      status: 'invited',
    });
  });

  console.log(`[REFERRAL] linked ${newUserEmail} (${newUserId}) to referrer ${referrer.id}`);
  return referrer;
}

// Signup with EMAIL or PHONE (at least one). No OTP gate — the account is created
// and immediately logged in (auto-session). A verification email link is sent; the
// user has a 7-day grace window before verification is required (enforced client
// side against verify_deadline; phone verification via SMS comes later).
async function signup({ email, phone, password, name, role, referralCode }) {
  email = email ? String(email).trim().toLowerCase() : null;
  phone = phone || null; // already normalized to canonical (+234…) or null by phoneBody
  if (!email && !phone) {
    throw new AppError('Enter an email address or phone number', 400, 'IDENTIFIER_REQUIRED');
  }

  // Existing account by either identifier?
  let existing = null;
  if (email) existing = await db('users').where({ email }).first();
  if (!existing && phone) existing = await db('users').where({ phone }).first();

  if (existing) {
    if (existing.account_status === 'inactive') {
      return {
        inactive_account: true,
        user_id: existing.id,
        name: existing.name,
        message: 'An account was set up for you by a tailor. Verify to activate it.',
      };
    }

    // A verified account already owns this identifier → must log in instead.
    if (existing.email_verified || existing.phone_verified) {
      throw new AppError('An account with this email or phone already exists', 409, 'EMAIL_EXISTS');
    }

    // Unverified → re-claim (a prior signup whose response was lost, etc). Safe:
    // ownership isn't proven until verified, so whoever completes it wins.
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await db('users').where({ id: existing.id }).update({
      password_hash: passwordHash,
      name,
      initials: getInitials(name),
      role,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      verify_deadline: verifyDeadlineFromNow(),
    });
    if (role === 'tailor') {
      const tp = await db('tailor_profiles').where({ user_id: existing.id }).first('user_id');
      if (!tp) {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        await db('tailor_profiles').insert({ user_id: existing.id, storefront_slug: `${slug}-${nanoid(4)}` });
      }
    }
    const fresh = await db('users').where({ id: existing.id }).first();
    await sendEmailVerification(fresh);
    return issueSession(fresh);
  }

  // Fresh account.
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const [user] = await db('users')
    .insert({
      email,
      phone,
      password_hash: passwordHash,
      role,
      name,
      initials: getInitials(name),
      referral_code: nanoid(8),
      account_status: 'active',
      verify_deadline: verifyDeadlineFromNow(),
    })
    .returning('*');

  if (role === 'tailor') {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    await db('tailor_profiles').insert({ user_id: user.id, storefront_slug: `${slug}-${nanoid(4)}` });
  }

  // Referral bookkeeping is best-effort — never blocks signup.
  if (referralCode) {
    applyReferral({ newUserId: user.id, newUserEmail: email || phone, code: referralCode })
      .catch((err) => console.error('[REFERRAL] signup apply failed:', err.message));
  }

  await sendEmailVerification(user);
  return issueSession(user);
}

// Re-issue the email verification link for the logged-in user (pending-tasks
// banner → "Resend verification email"). No-op if already verified / no email.
async function resendVerification(userId) {
  const user = await db('users').where({ id: userId }).first();
  if (user && user.email && !user.email_verified) {
    await sendEmailVerification(user);
  }
  return { message: 'If your email still needs verifying, a new link is on its way.' };
}

// Verify an email via the single-use link token. The user is typically already
// logged in (auto-session at signup) — this just flips email_verified and returns
// the refreshed public user so the SPA can update state without a reload.
async function verifyEmail({ token }, io) {
  if (!token) throw new AppError('Missing verification token', 400, 'INVALID_TOKEN');

  const user = await db('users').where({ email_verify_token: token }).first();
  if (!user) {
    throw new AppError('This verification link is invalid or has already been used', 400, 'INVALID_TOKEN');
  }

  const updates = { email_verified: true, email_verify_token: null };
  if (user.account_status === 'inactive') updates.account_status = 'active';
  await db('users').where({ id: user.id }).update(updates);

  // Referral join — flip invited → joined and notify the referrer (best-effort).
  try {
    const joined = await db('referrals')
      .where({ referee_id: user.id, status: 'invited' })
      .update({ status: 'joined' })
      .returning(['id', 'referrer_id']);

    if (joined.length > 0) {
      const referrerId = joined[0].referrer_id;
      createNotification({
        userId: referrerId,
        type: 'system',
        title: 'Someone joined using your invite',
        message: `${user.name} just signed up on Dinki using your referral code.`,
        metadata: { referee_id: user.id, referee_name: user.name, referee_role: user.role },
      }, io).catch((err) => console.error('[REFERRAL] join notify failed:', err.message));
    }
  } catch (err) {
    console.error('[REFERRAL] mark-joined failed:', err.message);
  }

  emailService.sendWelcome(user.email, user.name, user.role).catch(err => console.error('[EMAIL] Welcome send failed:', err.message));

  let tailorProfile = null;
  if (user.role === 'tailor') {
    tailorProfile = await db('tailor_profiles').where({ user_id: user.id }).first();
  }
  const fresh = await db('users').where({ id: user.id }).first();
  return { message: 'Email verified', user: publicUser(fresh, tailorProfile) };
}

// Login by EMAIL or PHONE. `identifier` is whatever the user typed; we detect an
// email by the '@' and otherwise treat it as a Nigerian phone (normalized to the
// canonical stored form before lookup). `email` is still accepted for backward
// compatibility.
async function login({ identifier, email, password }) {
  const raw = String(identifier || email || '').trim();
  let user = null;
  if (raw.includes('@')) {
    user = await db('users').where({ email: raw.toLowerCase() }).first();
  } else {
    const norm = normalizeNigerianPhone(raw);
    if (norm.ok && norm.value) {
      user = await db('users').where({ phone: norm.value }).first();
    }
  }

  if (!user) {
    throw new AppError('Invalid login or password', 401, 'INVALID_CREDENTIALS');
  }

  // Check if account is locked
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError('Account locked. Try again later.', 423, 'ACCOUNT_LOCKED');
  }

  const isValid = await bcrypt.compare(password, user.password_hash);

  if (!isValid) {
    // Increment failed login count
    const updates = { failed_login_count: user.failed_login_count + 1 };
    if (updates.failed_login_count >= 10) {
      updates.locked_until = new Date(Date.now() + 30 * 60 * 1000); // 30 min lock
    }
    await db('users').where({ id: user.id }).update(updates);
    throw new AppError('Invalid login or password', 401, 'INVALID_CREDENTIALS');
  }

  // No email-verified gate: within the 7-day grace new accounts can log in and
  // use the app. Verification is nudged via the dashboard banner and enforced
  // client-side once verify_deadline passes.

  // Reset failed login count & update login stats
  await db('users').where({ id: user.id }).update({
    failed_login_count: 0,
    locked_until: null,
    last_login_at: new Date(),
    login_count: user.login_count + 1,
  });

  let tailorProfile = null;
  if (user.role === 'tailor') {
    tailorProfile = await db('tailor_profiles').where({ user_id: user.id }).first();
  }
  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);
  return { accessToken, refreshToken, user: publicUser(user, tailorProfile) };
}

async function refresh(rawToken) {
  if (!rawToken) {
    throw new AppError('No refresh token', 401, 'AUTH_REQUIRED');
  }

  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const stored = await db('refresh_tokens').where({ token_hash: hash }).first();

  if (!stored || new Date(stored.expires_at) < new Date()) {
    throw new AppError('Invalid or expired refresh token', 401, 'INVALID_TOKEN');
  }

  // Delete used token (rotation)
  await db('refresh_tokens').where({ id: stored.id }).del();

  const user = await db('users').where({ id: stored.user_id }).first();
  if (!user || !user.is_active) {
    throw new AppError('User not found or inactive', 401, 'INVALID_TOKEN');
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  return { accessToken, refreshToken };
}

async function logout(rawToken) {
  if (!rawToken) return;
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await db('refresh_tokens').where({ token_hash: hash }).del();
}

async function forgotPassword(email) {
  const user = await db('users').where({ email }).first();
  // Always return success to prevent email enumeration
  if (!user) return { message: 'If the email exists, a reset link has been sent.' };

  const resetToken = crypto.randomBytes(32).toString('hex');
  await redis.setex(`reset:${resetToken}`, RESET_TOKEN_EXPIRY, user.id);

  // Send password reset email (non-blocking)
  emailService.sendPasswordReset(email, resetToken, user.name).catch(err => console.error('[EMAIL] Reset send failed:', err.message));

  if (config.env !== 'production') {
    console.log(`[DEV] Reset token for ${email}: ${resetToken}`);
  }

  return { message: 'If the email exists, a reset link has been sent.' };
}

async function resetPassword({ token, password }) {
  const userId = await redis.get(`reset:${token}`);
  if (!userId) {
    throw new AppError('Invalid or expired reset token', 400, 'INVALID_TOKEN');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await db('users').where({ id: userId }).update({ password_hash: passwordHash });

  // Invalidate all refresh tokens
  await db('refresh_tokens').where({ user_id: userId }).del();
  await redis.del(`reset:${token}`);

  return { message: 'Password reset. Please log in.' };
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await db('users').where({ id: userId }).first();
  const isValid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isValid) {
    throw new AppError('Current password is incorrect', 401, 'INVALID_CREDENTIALS');
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await db('users').where({ id: userId }).update({ password_hash: passwordHash });

  // Invalidate all refresh tokens
  await db('refresh_tokens').where({ user_id: userId }).del();

  return { message: 'Password changed. Please log in again.' };
}

/**
 * Activate an inactive account (created by a tailor on behalf of a customer).
 * Sets the real email + password, activates it, auto-logs-in (no OTP), and emails
 * a verification link with the standard 7-day grace.
 */
async function activate({ user_id, email, password, name }) {
  const user = await db('users').where({ id: user_id }).first();

  if (!user) {
    throw new AppError('Account not found', 404, 'NOT_FOUND');
  }

  if (user.account_status !== 'inactive') {
    throw new AppError('Account is already active', 400, 'ALREADY_ACTIVE');
  }

  const emailNorm = email ? String(email).trim().toLowerCase() : null;
  if (emailNorm) {
    const emailTaken = await db('users').where({ email: emailNorm }).whereNot({ id: user_id }).first();
    if (emailTaken) {
      throw new AppError('Email already registered to another account', 409, 'EMAIL_EXISTS');
    }
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const updates = {
    password_hash: passwordHash,
    account_status: 'active',
    verify_deadline: verifyDeadlineFromNow(),
    updated_at: new Date(),
  };
  if (emailNorm) updates.email = emailNorm;
  if (name) {
    updates.name = name;
    updates.initials = getInitials(name);
  }

  await db('users').where({ id: user_id }).update(updates);

  const fresh = await db('users').where({ id: user_id }).first();
  await sendEmailVerification(fresh);
  return issueSession(fresh);
}

module.exports = {
  signup,
  verifyEmail,
  resendVerification,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  activate,
};

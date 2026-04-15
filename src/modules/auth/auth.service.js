const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../../config/database');
const redis = require('../../config/redis');
const config = require('../../config');
const AppError = require('../../utils/AppError');
const { nanoid } = require('nanoid');

const SALT_ROUNDS = 12;
const OTP_EXPIRY = 5 * 60; // 5 minutes in seconds
const RESET_TOKEN_EXPIRY = 60 * 60; // 1 hour in seconds

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

async function signup({ email, password, name, role }) {
  // Check if email exists
  const existing = await db('users').where({ email }).first();

  if (existing) {
    // If it's an inactive placeholder account → tell frontend to activate instead
    if (existing.account_status === 'inactive') {
      return {
        inactive_account: true,
        user_id: existing.id,
        name: existing.name,
        message: 'An account was set up for you by a tailor. Verify to activate it.',
      };
    }
    throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
  }

  // Also check by phone if the user provided one (future: add phone to signup)
  // For now, only email matching in signup

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const referralCode = nanoid(8);
  const initials = getInitials(name);

  const [user] = await db('users')
    .insert({
      email,
      password_hash: passwordHash,
      role,
      name,
      initials,
      referral_code: referralCode,
      account_status: 'active',
    })
    .returning(['id', 'email', 'name', 'role']);

  // Create tailor_profile if tailor
  if (role === 'tailor') {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    await db('tailor_profiles').insert({
      user_id: user.id,
      storefront_slug: slug + '-' + nanoid(4),
    });
  }

  // Generate and store OTP
  const otp = generateOTP();
  await redis.setex(`otp:${email}`, OTP_EXPIRY, otp);

  // TODO: Send verification email via nodemailer
  // For now, log OTP in development
  if (config.env !== 'production') {
    console.log(`[DEV] OTP for ${email}: ${otp}`);
  }

  return { message: 'Account created. Please verify your email.', userId: user.id };
}

async function verifyEmail({ email, otp }) {
  const storedOTP = await redis.get(`otp:${email}`);

  if (!storedOTP || storedOTP !== otp) {
    throw new AppError('Invalid or expired OTP', 400, 'INVALID_OTP');
  }

  const user = await db('users').where({ email }).first();
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  // Activate account if it was inactive (tailor-created placeholder)
  const updates = { email_verified: true };
  if (user.account_status === 'inactive') {
    updates.account_status = 'active';
  }

  await db('users').where({ id: user.id }).update(updates);
  await redis.del(`otp:${email}`);

  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}

async function login({ email, password }) {
  const user = await db('users').where({ email }).first();

  if (!user) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
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
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  if (!user.email_verified) {
    // Re-send OTP
    const otp = generateOTP();
    await redis.setex(`otp:${email}`, OTP_EXPIRY, otp);
    if (config.env !== 'production') {
      console.log(`[DEV] OTP for ${email}: ${otp}`);
    }
    throw new AppError('Email not verified. New OTP sent.', 403, 'EMAIL_NOT_VERIFIED');
  }

  // Reset failed login count & update login stats
  await db('users').where({ id: user.id }).update({
    failed_login_count: 0,
    locked_until: null,
    last_login_at: new Date(),
    login_count: user.login_count + 1,
  });

  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  // Get tailor profile if applicable
  let tailorProfile = null;
  if (user.role === 'tailor') {
    tailorProfile = await db('tailor_profiles').where({ user_id: user.id }).first();
  }

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar_url: user.avatar_url,
      initials: user.initials,
      avatar_color: user.avatar_color,
      onboarding_completed: user.onboarding_completed,
      storefront_slug: tailorProfile?.storefront_slug || null,
    },
  };
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

  // TODO: Send email with reset link
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
 * Sets the real email, password, and sends an OTP for verification.
 */
async function activate({ user_id, email, password, name }) {
  const user = await db('users').where({ id: user_id }).first();

  if (!user) {
    throw new AppError('Account not found', 404, 'NOT_FOUND');
  }

  if (user.account_status !== 'inactive') {
    throw new AppError('Account is already active', 400, 'ALREADY_ACTIVE');
  }

  // Make sure the new email isn't taken by a different user
  const emailTaken = await db('users')
    .where({ email })
    .whereNot({ id: user_id })
    .first();

  if (emailTaken) {
    throw new AppError('Email already registered to another account', 409, 'EMAIL_EXISTS');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const updates = {
    email,
    password_hash: passwordHash,
    updated_at: new Date(),
  };

  if (name) {
    updates.name = name;
    updates.initials = getInitials(name);
  }

  await db('users').where({ id: user_id }).update(updates);

  // Generate and store OTP
  const otp = generateOTP();
  await redis.setex(`otp:${email}`, OTP_EXPIRY, otp);

  if (config.env !== 'production') {
    console.log(`[DEV] Activation OTP for ${email}: ${otp}`);
  }

  return {
    message: 'Verification code sent. Please check your email.',
    userId: user_id,
  };
}

/**
 * Complete activation after OTP verification.
 * This is called by the existing verifyEmail flow — we just need verifyEmail
 * to also set account_status = 'active' when verifying an inactive account.
 */

module.exports = {
  signup,
  verifyEmail,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  activate,
};

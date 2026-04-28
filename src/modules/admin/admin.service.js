/**
 * Admin service — read-only aggregate queries.
 *
 * Keep every function here SIDE-EFFECT FREE and READ-ONLY. The admin dashboard
 * lives on the hot path of every admin page load, so prefer one scan per table
 * with FILTER clauses over N round-trips.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { nanoid } = require('nanoid');
const knex = require('../../config/database');
const redis = require('../../config/redis');
const config = require('../../config');
const AppError = require('../../utils/AppError');
const emailService = require('../../services/emailService');

/**
 * Hard cap on a single broadcast's recipient count. Platform is young and
 * this is already well above what we expect; guard stops a mistyped scope
 * from fanning out INSERTs and socket emits into millions of rows.
 */
const BROADCAST_MAX_RECIPIENTS = 10000;

const SALT_ROUNDS = 12;
const RESET_TOKEN_EXPIRY = 60 * 60; // seconds — matches auth module
const VALID_ROLES = ['customer', 'tailor', 'admin', 'superadmin'];
const ROLE_RANK = { customer: 0, tailor: 0, admin: 1, superadmin: 2 };

/**
 * Single-scan user breakdown:
 *   - total users
 *   - per-role counts (customer, tailor, admin, superadmin)
 *   - how many of them are email-verified
 *   - new signups in the last 24h / 7d
 *
 * PostgreSQL `FILTER (WHERE ...)` lets us compute all of this in one pass
 * rather than five separate COUNT queries.
 */
async function getUserStats() {
  const { rows } = await knex.raw(`
    SELECT
      COUNT(*)::int                                                   AS total,
      COUNT(*) FILTER (WHERE role = 'customer')::int                  AS customers,
      COUNT(*) FILTER (WHERE role = 'tailor')::int                    AS tailors,
      COUNT(*) FILTER (WHERE role = 'admin')::int                     AS admins,
      COUNT(*) FILTER (WHERE role = 'superadmin')::int                AS superadmins,
      COUNT(*) FILTER (WHERE email_verified = true)::int              AS verified,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS new_24h,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int   AS new_7d
    FROM users
  `);
  return rows[0];
}

async function getJobStats() {
  const { rows } = await knex.raw(`
    SELECT
      COUNT(*)::int                                                AS total,
      COUNT(*) FILTER (WHERE status = 'cutting')::int              AS cutting,
      COUNT(*) FILTER (WHERE status = 'stitching')::int            AS stitching,
      COUNT(*) FILTER (WHERE status = 'ready')::int                AS ready,
      COUNT(*) FILTER (WHERE status = 'delivered')::int            AS delivered,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new_7d
    FROM jobs
  `);
  return rows[0];
}

async function getOrderStats() {
  const { rows } = await knex.raw(`
    SELECT
      COUNT(*)::int                                                AS total,
      COUNT(*) FILTER (WHERE status = 'pending')::int              AS pending,
      COUNT(*) FILTER (WHERE status = 'accepted')::int             AS accepted,
      COUNT(*) FILTER (WHERE status = 'in_progress')::int          AS in_progress,
      COUNT(*) FILTER (WHERE status = 'completed')::int            AS completed,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int            AS cancelled,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new_7d
    FROM orders
  `);
  return rows[0];
}

/**
 * "Measurements recorded" means the audit trail in `measurement_history` —
 * one row per time a tailor captured or updated a customer's measurements.
 * `customers_with_measurements` is a secondary signal: distinct customers
 * whose current measurements jsonb is non-empty.
 */
async function getMeasurementStats() {
  const { rows } = await knex.raw(`
    SELECT
      (SELECT COUNT(*) FROM measurement_history)::int                                        AS total,
      (SELECT COUNT(*) FROM measurement_history WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new_7d,
      (SELECT COUNT(*) FROM customers WHERE measurements IS NOT NULL AND measurements <> '{}'::jsonb)::int AS customers_with_measurements
  `);
  return rows[0];
}

async function getPlatformStats() {
  const [users, jobs, orders, measurements] = await Promise.all([
    getUserStats(),
    getJobStats(),
    getOrderStats(),
    getMeasurementStats(),
  ]);
  return { users, jobs, orders, measurements };
}

/**
 * Build the recipient predicate (Knex `where` builder) and a human-readable
 * descriptor for the audit log, given a validated target envelope.
 *
 * Only active users receive broadcasts — inactive/deactivated accounts are
 * excluded so we don't pollute their notification history with system spam.
 */
function recipientFilter(target) {
  if (target.scope === 'all') {
    return {
      apply: (qb) => qb.where('account_status', 'active'),
      descriptor: 'all active users',
    };
  }
  if (target.scope === 'role') {
    return {
      apply: (qb) => qb.where({ role: target.role, account_status: 'active' }),
      descriptor: `role:${target.role}`,
    };
  }
  if (target.scope === 'user') {
    return {
      apply: (qb) => qb.where({ id: target.userId }),
      descriptor: `user:${target.userId}`,
    };
  }
  // Defensive — validation should have caught this.
  throw new AppError('Invalid broadcast target', 400, 'VALIDATION_ERROR');
}

/**
 * Send a system notification to a set of users.
 *
 * Architecture:
 *   1. Count recipients first so we can refuse obviously-wrong broadcasts
 *      (empty audience, or beyond the recipient cap).
 *   2. One INSERT … SELECT writes all rows in a single round-trip.
 *   3. RETURNING gives us every new row so we can fan out socket events.
 *   4. Write one audit_log row with target, title, and final recipient count.
 *
 * Socket emit is best-effort. A transient Socket.IO failure does NOT unwind
 * the DB writes — the notifications are already durable and show up next
 * time the user opens the app.
 */
async function broadcastNotification({ actorId, target, title, message, link, email, ip, io }) {
  const filter = recipientFilter(target);

  // Pull id + name + email so we can emit, insert, AND (optionally) mail in
  // one round-trip instead of re-selecting. Email is required for the
  // per-recipient fan-out; we gracefully skip users without one.
  const recipients = await filter.apply(knex('users'))
    .select('id', 'name', 'email', 'is_active');

  if (recipients.length === 0) {
    throw new AppError('No users match this target', 400, 'NO_RECIPIENTS');
  }
  if (recipients.length > BROADCAST_MAX_RECIPIENTS) {
    throw new AppError(
      `Broadcast would reach ${recipients.length} users — cap is ${BROADCAST_MAX_RECIPIENTS}. Narrow the target.`,
      400,
      'BROADCAST_TOO_LARGE',
    );
  }

  console.log(
    `[BROADCAST] actor=${actorId} target=${filter.descriptor} ` +
    `recipients=${recipients.length} email=${Boolean(email)} ` +
    `sample_ids=${recipients.slice(0, 3).map((r) => r.id).join(',')}`
  );

  const metadata = link ? { link } : {};
  const metadataStr = JSON.stringify(metadata);

  const rows = recipients.map((r) => ({
    user_id: r.id,
    type: 'system',
    title,
    message: message || null,
    metadata: metadataStr,
  }));

  const inserted = await knex('notifications')
    .insert(rows)
    .returning(['id', 'user_id', 'type', 'title', 'message', 'metadata', 'is_read', 'created_at']);

  console.log(`[BROADCAST] inserted=${inserted.length} rows into notifications`);

  await knex('audit_log').insert({
    actor_id: actorId,
    action: 'notification.broadcast',
    target_type: 'notifications',
    metadata: JSON.stringify({
      target: filter.descriptor,
      title,
      recipient_count: inserted.length,
      has_message: Boolean(message),
      emailed: Boolean(email),
    }),
    ip_address: ip || null,
  });

  if (io) {
    for (const n of inserted) {
      io.to(`user:${n.user_id}`).emit('notification:new', n);
    }
  }

  // Fire-and-forget email fan-out. We intentionally don't block the HTTP
  // response on SMTP latency; Postfix can chew through these in the
  // background. A per-recipient failure is logged but doesn't poison the
  // broadcast — the in-app notification is already delivered.
  let emailed = 0;
  if (email) {
    const mailable = recipients.filter((r) =>
      r.email && !String(r.email).startsWith('deleted-') && r.is_active
    );
    emailed = mailable.length;
    console.log(`[BROADCAST] queueing ${mailable.length} system-notification emails`);
    Promise.allSettled(
      mailable.map((r) =>
        emailService.sendSystemNotification(r.email, {
          name: r.name,
          title,
          message,
          link,
        })
      )
    ).then((results) => {
      const failed = results.filter((x) => x.status === 'rejected').length;
      if (failed) console.error(`[BROADCAST] email: ${failed}/${results.length} failed`);
      else console.log(`[BROADCAST] email: all ${results.length} sent`);
    });
  }

  return {
    sent: inserted.length,
    emailed,
    target: filter.descriptor,
  };
}

/* ------------------------------------------------------------------ *
 *  User management                                                    *
 * ------------------------------------------------------------------ */

const USER_LIST_COLUMNS = [
  'id', 'email', 'name', 'username', 'phone', 'role',
  'email_verified', 'is_active', 'account_status',
  'avatar_url', 'initials', 'avatar_color',
  'last_login_at', 'login_count', 'created_at',
];

const USER_DETAIL_COLUMNS = [
  ...USER_LIST_COLUMNS,
  'bio', 'location_city', 'location_state', 'location_country',
  'specialties', 'onboarding_completed', 'referral_code',
  'failed_login_count', 'locked_until', 'updated_at',
];

/**
 * Refuse to touch a superadmin unless the actor is a superadmin too.
 * This is the single gate for "escalation protection" — call it at the top
 * of every mutation on a target user.
 */
function assertActorCanTouchTarget(actor, target) {
  if (actor.id === target.id) {
    // Nobody gets to demote, deactivate, or role-change themselves via
    // the admin panel. They can edit their own profile from /profile.
    // We only block *risky* operations here — callers decide which fields
    // matter (see updateUser below).
  }
  if (target.role === 'superadmin' && actor.role !== 'superadmin') {
    throw new AppError(
      'Only a superadmin can modify another superadmin.',
      403,
      'FORBIDDEN',
    );
  }
}

async function listUsers({ q, role, status, page = 1, limit = 20 }) {
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pg - 1) * lim;

  const qb = knex('users');

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    qb.where(function () {
      this.whereILike('name', term)
        .orWhereILike('email', term)
        .orWhereILike('username', term)
        .orWhereILike('phone', term);
    });
  }

  if (role && role !== 'all') {
    if (!VALID_ROLES.includes(role)) {
      throw new AppError('Invalid role filter', 400, 'VALIDATION_ERROR');
    }
    qb.where('role', role);
  }

  if (status === 'active') qb.where('is_active', true);
  else if (status === 'inactive') qb.where('is_active', false);
  // 'all' (or missing) — no filter

  const countQb = qb.clone().count('id as c').first();
  const rowsQb = qb
    .clone()
    .select(USER_LIST_COLUMNS)
    .orderBy('created_at', 'desc')
    .limit(lim)
    .offset(offset);

  const [countRow, rows] = await Promise.all([countQb, rowsQb]);
  const total = parseInt(countRow?.c || 0, 10);

  return {
    users: rows,
    pagination: {
      page: pg,
      limit: lim,
      total,
      totalPages: Math.ceil(total / lim),
    },
  };
}

async function getUserDetail(userId) {
  const user = await knex('users')
    .where({ id: userId })
    .select(USER_DETAIL_COLUMNS)
    .first();

  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

  if (user.role === 'tailor') {
    const profile = await knex('tailor_profiles').where({ user_id: userId }).first();
    if (profile) {
      user.tailor_profile = {
        verified: profile.verified,
        completed_jobs: profile.completed_jobs,
        rating_avg: profile.rating_avg,
        rating_count: profile.rating_count,
        storefront_slug: profile.storefront_slug,
        start_price: profile.start_price,
        years_experience: profile.years_experience,
      };
    }
  }

  // Light-touch activity summary — useful for admin judgement without
  // dragging in full job/order history.
  const [jobsRow, ordersRow] = await Promise.all([
    knex('jobs').where({ tailor_id: userId }).count('id as c').first(),
    knex('orders')
      .where({ customer_id: userId })
      .orWhere({ tailor_id: userId })
      .count('id as c')
      .first(),
  ]);
  user.activity = {
    jobs: parseInt(jobsRow?.c || 0, 10),
    orders: parseInt(ordersRow?.c || 0, 10),
  };

  return user;
}

/**
 * Update a user's profile/role/status.
 *
 * Allowed fields:
 *   name, phone, username, email        — any admin
 *   is_active                           — any admin (but can't deactivate self or a superadmin)
 *   role                                — superadmin only
 *
 * Side-effects:
 *   - Changing email flips email_verified back to false.
 *   - Changing role or deactivating wipes refresh_tokens (forces re-login).
 *   - Every successful call writes one audit_log row.
 */
async function updateUser({ actor, targetId, updates, ip }) {
  const target = await knex('users').where({ id: targetId }).first();
  if (!target) throw new AppError('User not found', 404, 'NOT_FOUND');

  assertActorCanTouchTarget(actor, target);

  const patch = {};
  const changes = {};

  // Plain profile fields — any admin
  for (const field of ['name', 'phone']) {
    if (updates[field] !== undefined && updates[field] !== target[field]) {
      patch[field] = updates[field];
      changes[field] = { from: target[field], to: updates[field] };
    }
  }

  if (patch.name) {
    patch.initials = patch.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  }

  // Phone uniqueness — `updates.phone` is already canonical (validation layer
  // ran phoneBody() and rewrote it). Block the update if any OTHER row owns
  // this number, mirroring the username/email rules just below.
  if (patch.phone) {
    const taken = await knex('users')
      .where('phone', patch.phone)
      .whereNot('id', targetId)
      .first('id');
    if (taken) {
      throw new AppError(
        'This phone number is already in use by another account.',
        409,
        'PHONE_EXISTS',
      );
    }
  }

  // Username — uniqueness check
  if (updates.username !== undefined && updates.username !== target.username) {
    const taken = await knex('users')
      .whereRaw('LOWER(username) = ?', [String(updates.username).toLowerCase()])
      .whereNot('id', targetId)
      .first('id');
    if (taken) throw new AppError('Username is already taken', 409, 'USERNAME_TAKEN');
    patch.username = updates.username;
    changes.username = { from: target.username, to: updates.username };
  }

  // Email — uniqueness + reset verification flag
  if (updates.email !== undefined) {
    const newEmail = String(updates.email).trim().toLowerCase();
    if (newEmail !== (target.email || '').toLowerCase()) {
      const taken = await knex('users')
        .whereRaw('LOWER(email) = ?', [newEmail])
        .whereNot('id', targetId)
        .first('id');
      if (taken) throw new AppError('Email already registered to another account', 409, 'EMAIL_EXISTS');
      patch.email = newEmail;
      patch.email_verified = false;
      changes.email = { from: target.email, to: newEmail, email_verified_reset: true };
    }
  }

  // is_active — superadmin cannot deactivate themselves; admin cannot touch superadmin
  if (updates.is_active !== undefined && updates.is_active !== target.is_active) {
    if (!updates.is_active && actor.id === target.id) {
      throw new AppError('You cannot deactivate your own account.', 403, 'FORBIDDEN');
    }
    patch.is_active = Boolean(updates.is_active);
    changes.is_active = { from: target.is_active, to: patch.is_active };
  }

  // Role — superadmin only, with further safety rails.
  if (updates.role !== undefined && updates.role !== target.role) {
    if (actor.role !== 'superadmin') {
      throw new AppError('Only a superadmin can change roles.', 403, 'FORBIDDEN');
    }
    if (!VALID_ROLES.includes(updates.role)) {
      throw new AppError('Invalid role.', 400, 'VALIDATION_ERROR');
    }
    if (actor.id === target.id) {
      throw new AppError('You cannot change your own role.', 403, 'FORBIDDEN');
    }
    patch.role = updates.role;
    changes.role = { from: target.role, to: updates.role };
  }

  if (Object.keys(patch).length === 0) {
    throw new AppError('No changes to apply.', 400, 'NO_CHANGES');
  }

  patch.updated_at = new Date();

  const mustRevokeSessions = changes.role || (changes.is_active && changes.is_active.to === false);

  await knex.transaction(async (trx) => {
    await trx('users').where({ id: targetId }).update(patch);

    // Role change side-effects. Treat a role switch as "new account for that
    // role" — without this, a freshly-made tailor has no tailor_profiles row
    // and their dashboard falls into an error loop.
    if (changes.role) {
      const newRole = changes.role.to;

      // Force onboarding for non-staff roles so they re-enter the flow that
      // collects location, specialties, etc. Admin/superadmin don't use the
      // onboarding page, so we leave their flag alone.
      if (newRole === 'customer' || newRole === 'tailor') {
        await trx('users').where({ id: targetId }).update({ onboarding_completed: false });
      }

      if (newRole === 'tailor') {
        const finalName = patch.name || target.name || 'Tailor';
        const existingProfile = await trx('tailor_profiles').where({ user_id: targetId }).first();

        if (!existingProfile) {
          // First time as a tailor — mirror the signup-time setup so the
          // dashboard has something to read.
          const baseSlug = finalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'tailor';
          await trx('tailor_profiles').insert({
            user_id: targetId,
            storefront_slug: `${baseSlug}-${nanoid(4)}`,
            storefront_setup_completed: false,
          });
        } else {
          // Returning tailor (was a tailor before, switched away, now back).
          // Keep the slug for URL continuity but wipe storefront content so
          // they go through the setup wizard again.
          await trx('tailor_profiles').where({ user_id: targetId }).update({
            storefront_setup_completed: false,
            storefront_bio: null,
            storefront_image: null,
          });
        }
      }
    }

    if (mustRevokeSessions) {
      await trx('refresh_tokens').where({ user_id: targetId }).del();
    }

    await trx('audit_log').insert({
      actor_id: actor.id,
      action: changes.role ? 'user.role_change' :
              changes.is_active ? `user.${changes.is_active.to ? 'reactivate' : 'deactivate'}` :
              'user.update',
      target_type: 'user',
      target_id: targetId,
      metadata: JSON.stringify({
        changes,
        sessions_revoked: Boolean(mustRevokeSessions),
      }),
      ip_address: ip || null,
    });
  });

  return getUserDetail(targetId);
}

/**
 * Kick off the standard forgot-password email flow on behalf of a user.
 * The reset token is stored in Redis the same way the public flow does it,
 * so reuse of resetPassword on /auth/reset-password is seamless.
 */
async function resetUserPassword({ actor, targetId, ip }) {
  const target = await knex('users').where({ id: targetId }).first();
  if (!target) throw new AppError('User not found', 404, 'NOT_FOUND');
  assertActorCanTouchTarget(actor, target);

  const token = crypto.randomBytes(32).toString('hex');
  await redis.setex(`reset:${token}`, RESET_TOKEN_EXPIRY, target.id);

  emailService
    .sendPasswordReset(target.email, token, target.name)
    .catch((err) => console.error('[EMAIL] Admin-triggered reset send failed:', err.message));

  if (config.env !== 'production') {
    console.log(`[DEV] Admin reset token for ${target.email}: ${token}`);
  }

  await knex('audit_log').insert({
    actor_id: actor.id,
    action: 'user.password_reset_email',
    target_type: 'user',
    target_id: target.id,
    metadata: JSON.stringify({ email: target.email }),
    ip_address: ip || null,
  });

  return { message: 'Password reset email queued.' };
}

/**
 * Hard-set a new password without the reset-email detour. Use this only
 * when the user has lost control of their email too. All sessions are
 * revoked so nobody keeps an old token.
 */
async function setUserPassword({ actor, targetId, newPassword, ip }) {
  const target = await knex('users').where({ id: targetId }).first();
  if (!target) throw new AppError('User not found', 404, 'NOT_FOUND');
  assertActorCanTouchTarget(actor, target);

  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await knex.transaction(async (trx) => {
    await trx('users').where({ id: targetId }).update({
      password_hash: hash,
      updated_at: new Date(),
      failed_login_count: 0,
      locked_until: null,
    });
    await trx('refresh_tokens').where({ user_id: targetId }).del();
    await trx('audit_log').insert({
      actor_id: actor.id,
      action: 'user.password_set',
      target_type: 'user',
      target_id: target.id,
      metadata: JSON.stringify({ via: 'admin_panel' }),
      ip_address: ip || null,
    });
  });

  return { message: 'Password set. All sessions revoked.' };
}

/**
 * Anonymize a user — strip all personally-identifiable information from the
 * users row (and linked customer records / tailor storefront), kill sessions,
 * but preserve the row itself. This is the NDPR/GDPR "right to erasure"
 * implementation: legally the user's personal data is no longer present,
 * while counterparty records (other tailors' order history, other users'
 * messages) stay intact with "Deleted User" attribution.
 *
 * Irreversible.
 */
async function anonymizeUser({ actor, targetId, ip }) {
  const target = await knex('users').where({ id: targetId }).first();
  if (!target) throw new AppError('User not found', 404, 'NOT_FOUND');

  assertActorCanTouchTarget(actor, target);

  if (actor.id === target.id) {
    throw new AppError('You cannot anonymize your own account from the admin panel.', 403, 'FORBIDDEN');
  }

  if (target.account_status === 'anonymized') {
    throw new AppError('User is already anonymized.', 400, 'ALREADY_ANONYMIZED');
  }

  const anonEmail = `deleted-${target.id}@dinki.africa`;
  const anonName = 'Deleted User';
  // Random bcrypt hash so any future login attempt fails at compare, even
  // if is_active is somehow flipped back on. Defense-in-depth.
  const randomPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), SALT_ROUNDS);

  await knex.transaction(async (trx) => {
    // Audit log BEFORE mutation so the snapshot is captured
    await trx('audit_log').insert({
      actor_id: actor.id,
      action: 'user.anonymize',
      target_type: 'user',
      target_id: target.id,
      metadata: JSON.stringify({
        previous_email: target.email,
        previous_name: target.name,
        previous_phone: target.phone,
        previous_role: target.role,
      }),
      ip_address: ip || null,
    });

    await trx('users').where({ id: target.id }).update({
      email: anonEmail,
      name: anonName,
      phone: null,
      avatar_url: null,
      initials: 'DU',
      avatar_color: null,
      bio: null,
      location_city: null,
      location_state: null,
      latitude: null,
      longitude: null,
      specialties: null,
      username: null,
      password_hash: randomPasswordHash,
      email_verified: false,
      phone_verified: false,
      is_active: false,
      account_status: 'anonymized',
      preferences: JSON.stringify({}),
      updated_at: new Date(),
    });

    // Wipe PII on linked customer records (rows where this user appears AS a
    // customer of some tailor). The customer row stays — the tailor's history
    // is preserved — but the identifying fields are scrubbed.
    await trx('customers').where({ user_id: target.id }).update({
      name: anonName,
      phone: null,
      email: null,
      location: null,
    });

    // Tailor storefront bio + image often contain personal details.
    if (target.role === 'tailor') {
      await trx('tailor_profiles').where({ user_id: target.id }).update({
        storefront_bio: null,
        storefront_image: null,
      });
    }

    await trx('refresh_tokens').where({ user_id: target.id }).del();
  });

  return { anonymized: true };
}

/**
 * Hard-delete a user. Superadmin-only, with a typed-email confirmation and
 * a "last superadmin" guard. FK cascade policies from migration 022 handle
 * the downstream cleanup — orders/reviews/conversations/messages belonging
 * to the user are deleted; articles/fabrics/audit-log entries they authored
 * are kept with their pointer nulled.
 *
 * This is the heaviest action in the admin panel. Use for test accounts and
 * abuse cleanup, not for NDPR-style erasure (use anonymizeUser for that).
 */
async function hardDeleteUser({ actor, targetId, confirmEmail, ip }) {
  if (actor.role !== 'superadmin') {
    throw new AppError('Only a superadmin can hard-delete a user.', 403, 'FORBIDDEN');
  }

  const target = await knex('users').where({ id: targetId }).first();
  if (!target) throw new AppError('User not found', 404, 'NOT_FOUND');

  if (actor.id === target.id) {
    throw new AppError('You cannot delete your own account.', 403, 'FORBIDDEN');
  }

  if (target.role === 'superadmin') {
    const row = await knex('users').where({ role: 'superadmin' }).count('id as c').first();
    if (parseInt(row?.c || 0, 10) <= 1) {
      throw new AppError('Cannot delete the last remaining superadmin.', 403, 'LAST_SUPERADMIN');
    }
  }

  // Typed-email confirmation. Forces the caller to physically look at who
  // they are deleting instead of firing the endpoint from muscle memory.
  const expected = (target.email || '').trim().toLowerCase();
  const got = (confirmEmail || '').trim().toLowerCase();
  if (!expected || got !== expected) {
    throw new AppError("Confirmation email doesn't match the user's current email.", 400, 'CONFIRM_MISMATCH');
  }

  await knex.transaction(async (trx) => {
    // Capture the snapshot BEFORE the delete — target_id is intentionally
    // left null because the user row is about to disappear and the FK would
    // otherwise blow up this very insert on commit.
    await trx('audit_log').insert({
      actor_id: actor.id,
      action: 'user.hard_delete',
      target_type: 'user',
      target_id: null,
      metadata: JSON.stringify({
        user_id: target.id,
        email: target.email,
        name: target.name,
        role: target.role,
        created_at: target.created_at,
      }),
      ip_address: ip || null,
    });

    await trx('users').where({ id: target.id }).del();
  });

  return { deleted: true };
}

async function forceLogoutUser({ actor, targetId, ip }) {
  const target = await knex('users').where({ id: targetId }).first();
  if (!target) throw new AppError('User not found', 404, 'NOT_FOUND');
  assertActorCanTouchTarget(actor, target);

  const deleted = await knex('refresh_tokens').where({ user_id: targetId }).del();

  await knex('audit_log').insert({
    actor_id: actor.id,
    action: 'user.force_logout',
    target_type: 'user',
    target_id: target.id,
    metadata: JSON.stringify({ sessions_revoked: deleted }),
    ip_address: ip || null,
  });

  return { sessions_revoked: deleted };
}

module.exports = {
  getUserStats,
  getJobStats,
  getOrderStats,
  getMeasurementStats,
  getPlatformStats,
  broadcastNotification,
  BROADCAST_MAX_RECIPIENTS,
  listUsers,
  getUserDetail,
  updateUser,
  resetUserPassword,
  setUserPassword,
  forceLogoutUser,
  anonymizeUser,
  hardDeleteUser,
  VALID_ROLES,
  ROLE_RANK,
};

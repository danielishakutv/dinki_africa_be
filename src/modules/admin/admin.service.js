/**
 * Admin service — read-only aggregate queries.
 *
 * Keep every function here SIDE-EFFECT FREE and READ-ONLY. The admin dashboard
 * lives on the hot path of every admin page load, so prefer one scan per table
 * with FILTER clauses over N round-trips.
 */

const knex = require('../../config/database');
const AppError = require('../../utils/AppError');

/**
 * Hard cap on a single broadcast's recipient count. Platform is young and
 * this is already well above what we expect; guard stops a mistyped scope
 * from fanning out INSERTs and socket emits into millions of rows.
 */
const BROADCAST_MAX_RECIPIENTS = 10000;

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
async function broadcastNotification({ actorId, target, title, message, link, ip, io }) {
  const filter = recipientFilter(target);

  const recipientIds = await filter.apply(knex('users')).pluck('id');

  if (recipientIds.length === 0) {
    throw new AppError('No users match this target', 400, 'NO_RECIPIENTS');
  }
  if (recipientIds.length > BROADCAST_MAX_RECIPIENTS) {
    throw new AppError(
      `Broadcast would reach ${recipientIds.length} users — cap is ${BROADCAST_MAX_RECIPIENTS}. Narrow the target.`,
      400,
      'BROADCAST_TOO_LARGE',
    );
  }

  const metadata = link ? { link } : {};
  const metadataStr = JSON.stringify(metadata);

  const rows = recipientIds.map((userId) => ({
    user_id: userId,
    type: 'system',
    title,
    message: message || null,
    metadata: metadataStr,
  }));

  const inserted = await knex('notifications')
    .insert(rows)
    .returning(['id', 'user_id', 'type', 'title', 'message', 'metadata', 'is_read', 'created_at']);

  await knex('audit_log').insert({
    actor_id: actorId,
    action: 'notification.broadcast',
    target_type: 'notifications',
    metadata: JSON.stringify({
      target: filter.descriptor,
      title,
      recipient_count: inserted.length,
      has_message: Boolean(message),
    }),
    ip_address: ip || null,
  });

  if (io) {
    for (const n of inserted) {
      io.to(`user:${n.user_id}`).emit('notification:new', n);
    }
  }

  return {
    sent: inserted.length,
    target: filter.descriptor,
  };
}

module.exports = {
  getUserStats,
  getJobStats,
  getOrderStats,
  getMeasurementStats,
  getPlatformStats,
  broadcastNotification,
  BROADCAST_MAX_RECIPIENTS,
};

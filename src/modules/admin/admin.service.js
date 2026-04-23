/**
 * Admin service — read-only aggregate queries.
 *
 * Keep every function here SIDE-EFFECT FREE and READ-ONLY. The admin dashboard
 * lives on the hot path of every admin page load, so prefer one scan per table
 * with FILTER clauses over N round-trips.
 */

const knex = require('../../config/database');

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

async function getPlatformStats() {
  const [users, jobs, orders] = await Promise.all([
    getUserStats(),
    getJobStats(),
    getOrderStats(),
  ]);
  return { users, jobs, orders };
}

module.exports = {
  getUserStats,
  getJobStats,
  getOrderStats,
  getPlatformStats,
};

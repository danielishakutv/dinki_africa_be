/**
 * Referrals — read-side service.
 *
 * Writes happen inline in the auth flow (signup links, verifyEmail joins)
 * because referrals are state transitions tied to the auth lifecycle, not
 * a standalone object the user mutates.
 *
 * This service only exposes two reads:
 *   - getMyStats(userId) → the current user's referral snapshot
 *   - getByCode(code)    → public lookup for the invite landing page
 */

const db = require('../../config/database');
const config = require('../../config');
const AppError = require('../../utils/AppError');

function buildInviteLink(code) {
  const base = config.frontendUrl || 'https://dinki.africa';
  return `${base.replace(/\/$/, '')}/invite/${code}`;
}

/**
 * Aggregated counts + a paginated list of the caller's referees.
 */
async function getMyStats(userId, { limit = 20, offset = 0 } = {}) {
  const user = await db('users')
    .where({ id: userId })
    .first('id', 'referral_code');
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

  // Single-scan aggregation — one query for all four status counts.
  const [agg] = await db.raw(`
    SELECT
      COUNT(*)::int                                             AS total,
      COUNT(*) FILTER (WHERE status = 'invited')::int           AS invited,
      COUNT(*) FILTER (WHERE status = 'joined')::int            AS joined,
      COUNT(*) FILTER (WHERE status = 'rewarded')::int          AS rewarded,
      COALESCE(SUM(reward_amount) FILTER (WHERE status = 'rewarded'), 0)::int AS total_reward
    FROM referrals
    WHERE referrer_id = ?
  `, [userId]).then((r) => r.rows);

  const referees = await db('referrals as r')
    .leftJoin('users as u', 'r.referee_id', 'u.id')
    .where('r.referrer_id', userId)
    .orderBy('r.created_at', 'desc')
    .limit(limit)
    .offset(offset)
    .select(
      'r.id',
      'r.status',
      'r.reward_amount',
      'r.created_at',
      'r.referee_email',
      'u.id as user_id',
      'u.name as user_name',
      'u.role as user_role',
      'u.avatar_url',
      'u.initials',
    );

  return {
    code: user.referral_code,
    inviteLink: buildInviteLink(user.referral_code),
    stats: {
      total: agg.total || 0,
      invited: agg.invited || 0,
      joined: agg.joined || 0,
      rewarded: agg.rewarded || 0,
      totalReward: agg.total_reward || 0,
    },
    referees,
  };
}

/**
 * Public-ish lookup for an invite code — used by the /invite/:code landing
 * page to render "Invited by {name}". Returns 404 if the code doesn't
 * resolve so we don't reveal code space layout.
 */
async function getByCode(code) {
  const referrer = await db('users')
    .where({ referral_code: code, is_active: true })
    .first('id', 'name', 'role', 'avatar_url', 'initials', 'avatar_color');

  if (!referrer) throw new AppError('Invalid invite code', 404, 'NOT_FOUND');

  // Deliberately minimal — no email, no phone, no location. Just enough
  // to render a friendly "invited by X" on a PUBLIC page.
  return {
    name: referrer.name,
    role: referrer.role,
    avatar_url: referrer.avatar_url,
    initials: referrer.initials,
    avatar_color: referrer.avatar_color,
  };
}

module.exports = { getMyStats, getByCode };

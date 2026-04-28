/**
 * Admin analytics service — read-only product analytics queries.
 *
 * Every function here is SIDE-EFFECT FREE and READ-ONLY. These power the
 * /admin/analytics dashboard. Where possible we lean on FILTER (WHERE …)
 * and CTEs to keep round-trips to one per chart.
 *
 * "Active user" definition (used across DAU/MAU/cohorts):
 *   A user is considered active on day D if any of the following touched
 *   their row on D:
 *     - sent a message       (messages.sender_id, created_at)
 *     - placed an order      (orders.customer_id, created_at)
 *     - received an order    (orders.tailor_id,   updated_at)
 *     - moved a job          (jobs.tailor_id,     updated_at)
 *     - logged in            (users.last_login_at)
 *   Browse-only sessions are NOT visible from the DB — for those we'll
 *   layer Matomo events on top of this baseline.
 */

const knex = require('../../config/database');

const RANGE_DAYS_DEFAULT = 30;
const TIMESERIES_DAYS_DEFAULT = 90;
const COHORT_WEEKS_DEFAULT = 8;
const TIMESERIES_DAYS_MAX = 180;
const COHORT_WEEKS_MAX = 12;

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/* ------------------------------------------------------------------ *
 *  1. Overview KPIs                                                   *
 * ------------------------------------------------------------------ */

/**
 * Single-pass header bar of the dashboard. Every figure is anchored to
 * `days` so toggling 7/30/90 in the UI re-renders consistently.
 */
async function getOverview({ days = RANGE_DAYS_DEFAULT } = {}) {
  const range = clampInt(days, 1, 365, RANGE_DAYS_DEFAULT);

  // User totals + signups in window
  const usersQ = knex.raw(
    `
    SELECT
      COUNT(*)::int                                                                  AS total_users,
      COUNT(*) FILTER (WHERE is_active AND account_status = 'active')::int           AS active_accounts,
      COUNT(*) FILTER (WHERE created_at >= NOW() - (?::int || ' days')::interval)::int AS new_signups,
      COUNT(*) FILTER (
        WHERE role = 'customer'
        AND   created_at >= NOW() - (?::int || ' days')::interval
      )::int                                                                         AS new_customers,
      COUNT(*) FILTER (
        WHERE role = 'tailor'
        AND   created_at >= NOW() - (?::int || ' days')::interval
      )::int                                                                         AS new_tailors,
      COUNT(*) FILTER (WHERE email_verified)::int                                    AS email_verified
    FROM users
  `,
    [range, range, range]
  );

  // DAU / MAU based on the unified activity definition
  const activeQ = knex.raw(`
    WITH activity AS (
      SELECT sender_id  AS user_id, created_at AS at FROM messages
      WHERE created_at >= NOW() - INTERVAL '30 days'
      UNION ALL
      SELECT customer_id, created_at FROM orders
      WHERE created_at >= NOW() - INTERVAL '30 days'
      UNION ALL
      SELECT tailor_id,   updated_at FROM orders
      WHERE updated_at >= NOW() - INTERVAL '30 days'
      UNION ALL
      SELECT tailor_id,   updated_at FROM jobs
      WHERE updated_at >= NOW() - INTERVAL '30 days'
      UNION ALL
      SELECT id, last_login_at FROM users
      WHERE last_login_at >= NOW() - INTERVAL '30 days'
    )
    SELECT
      COUNT(DISTINCT user_id) FILTER (WHERE at >= NOW() - INTERVAL '1 day')::int  AS dau,
      COUNT(DISTINCT user_id) FILTER (WHERE at >= NOW() - INTERVAL '7 days')::int AS wau,
      COUNT(DISTINCT user_id)::int                                                AS mau
    FROM activity
  `);

  // GMV — sum of completed orders in window (orders.budget is naira, integer)
  const gmvQ = knex.raw(
    `
    SELECT
      COALESCE(SUM(budget), 0)::bigint                       AS gmv,
      COUNT(*) FILTER (WHERE status = 'completed')::int      AS completed_orders,
      COUNT(*)::int                                          AS orders_total
    FROM orders
    WHERE created_at >= NOW() - (?::int || ' days')::interval
      AND status = 'completed'
  `,
    [range]
  );

  // Engagement totals in window
  const engagementQ = knex.raw(
    `
    SELECT
      (SELECT COUNT(*) FROM messages WHERE created_at >= NOW() - (?::int || ' days')::interval)::int AS messages_sent,
      (SELECT COUNT(*) FROM conversations WHERE created_at >= NOW() - (?::int || ' days')::interval)::int AS conversations_started,
      (SELECT COUNT(*) FROM favourites   WHERE created_at >= NOW() - (?::int || ' days')::interval)::int AS favourites_added,
      (SELECT COUNT(*) FROM reviews      WHERE created_at >= NOW() - (?::int || ' days')::interval)::int AS reviews_submitted
  `,
    [range, range, range, range]
  );

  // Activation rate — measurements added.
  //   Customer activated  = a tailor has captured measurements for them
  //                         (user.id appears as measurement_history.user_id).
  //   Tailor activated    = they have captured measurements for at least one
  //                         customer (user.id appears as measurement_history.tailor_id).
  // Measurements being recorded marks a real tailor-customer relationship in
  // the app — the foundational moment everything else (orders, jobs) follows.
  const activationQ = knex.raw(
    `
    SELECT
      (
        SELECT COUNT(*)::int FROM users
        WHERE role = 'customer' AND created_at >= NOW() - (?::int || ' days')::interval
      ) AS customer_signups,
      (
        SELECT COUNT(DISTINCT u.id)::int
        FROM users u
        JOIN measurement_history mh ON mh.user_id = u.id
        WHERE u.role = 'customer'
          AND u.created_at >= NOW() - (?::int || ' days')::interval
      ) AS customers_with_measurements,
      (
        SELECT COUNT(*)::int FROM users
        WHERE role = 'tailor' AND created_at >= NOW() - (?::int || ' days')::interval
      ) AS tailor_signups,
      (
        SELECT COUNT(DISTINCT u.id)::int
        FROM users u
        JOIN measurement_history mh ON mh.tailor_id = u.id
        WHERE u.role = 'tailor'
          AND u.created_at >= NOW() - (?::int || ' days')::interval
      ) AS tailors_recorded_measurements
  `,
    [range, range, range, range]
  );

  const [users, active, gmv, engagement, activation] = await Promise.all([
    usersQ, activeQ, gmvQ, engagementQ, activationQ,
  ]);

  const u = users.rows[0];
  const a = active.rows[0];
  const g = gmv.rows[0];
  const e = engagement.rows[0];
  const ac = activation.rows[0];

  const stickiness = a.mau > 0 ? +(a.dau / a.mau).toFixed(3) : 0;
  const customerActivationPct = ac.customer_signups > 0
    ? +(ac.customers_with_measurements / ac.customer_signups * 100).toFixed(1)
    : 0;
  const tailorActivationPct = ac.tailor_signups > 0
    ? +(ac.tailors_recorded_measurements / ac.tailor_signups * 100).toFixed(1)
    : 0;

  return {
    range_days: range,
    users: {
      total: u.total_users,
      active_accounts: u.active_accounts,
      new_signups: u.new_signups,
      new_customers: u.new_customers,
      new_tailors: u.new_tailors,
      email_verified: u.email_verified,
    },
    engagement: {
      dau: a.dau,
      wau: a.wau,
      mau: a.mau,
      stickiness, // DAU / MAU, 0..1
      messages_sent: e.messages_sent,
      conversations_started: e.conversations_started,
      favourites_added: e.favourites_added,
      reviews_submitted: e.reviews_submitted,
    },
    revenue: {
      gmv: Number(g.gmv),
      completed_orders: g.completed_orders,
      orders_total: g.orders_total,
    },
    activation: {
      customer_signups: ac.customer_signups,
      customers_activated: ac.customers_with_measurements,
      customer_rate_pct: customerActivationPct,
      tailor_signups: ac.tailor_signups,
      tailors_activated: ac.tailors_recorded_measurements,
      tailor_rate_pct: tailorActivationPct,
    },
  };
}

/* ------------------------------------------------------------------ *
 *  2. Timeseries — daily signups + DAU together                       *
 * ------------------------------------------------------------------ */

/**
 * Daily timeseries for the line chart. Returns N+1 rows (today inclusive).
 * Two series share the same x-axis: signups (split by role) and DAU.
 */
async function getTimeseries({ days = TIMESERIES_DAYS_DEFAULT } = {}) {
  const range = clampInt(days, 7, TIMESERIES_DAYS_MAX, TIMESERIES_DAYS_DEFAULT);

  // Signups per day, split by role
  const signupsQ = knex.raw(
    `
    SELECT
      DATE_TRUNC('day', created_at)::date AS day,
      COUNT(*) FILTER (WHERE role = 'customer')::int AS customers,
      COUNT(*) FILTER (WHERE role = 'tailor')::int   AS tailors,
      COUNT(*)::int                                  AS total
    FROM users
    WHERE created_at >= DATE_TRUNC('day', NOW()) - (?::int || ' days')::interval
    GROUP BY day
    ORDER BY day ASC
  `,
    [range]
  );

  // DAU per day, using the unified activity definition. Built from a UNION
  // of every activity stream so a single user counted once per day.
  const dauQ = knex.raw(
    `
    WITH activity AS (
      SELECT sender_id AS user_id, DATE_TRUNC('day', created_at)::date AS day FROM messages
      WHERE created_at >= DATE_TRUNC('day', NOW()) - (?::int || ' days')::interval
      UNION
      SELECT customer_id, DATE_TRUNC('day', created_at)::date FROM orders
      WHERE created_at >= DATE_TRUNC('day', NOW()) - (?::int || ' days')::interval
      UNION
      SELECT tailor_id,   DATE_TRUNC('day', updated_at)::date FROM orders
      WHERE updated_at >= DATE_TRUNC('day', NOW()) - (?::int || ' days')::interval
      UNION
      SELECT tailor_id,   DATE_TRUNC('day', updated_at)::date FROM jobs
      WHERE updated_at >= DATE_TRUNC('day', NOW()) - (?::int || ' days')::interval
      UNION
      SELECT id, DATE_TRUNC('day', last_login_at)::date FROM users
      WHERE last_login_at >= DATE_TRUNC('day', NOW()) - (?::int || ' days')::interval
    )
    SELECT day, COUNT(DISTINCT user_id)::int AS dau
    FROM activity
    GROUP BY day
    ORDER BY day ASC
  `,
    [range, range, range, range, range]
  );

  // Messages per day — engagement signal
  const messagesQ = knex.raw(
    `
    SELECT
      DATE_TRUNC('day', created_at)::date AS day,
      COUNT(*)::int                       AS messages
    FROM messages
    WHERE created_at >= DATE_TRUNC('day', NOW()) - (?::int || ' days')::interval
    GROUP BY day
    ORDER BY day ASC
  `,
    [range]
  );

  const [signups, dau, messages] = await Promise.all([signupsQ, dauQ, messagesQ]);

  // Build a dense series — fill missing days with zeros so the line chart
  // doesn't visually compress quiet weeks.
  const map = new Map();
  for (let i = range; i >= 0; i--) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { date: key, customers: 0, tailors: 0, signups: 0, dau: 0, messages: 0 });
  }
  for (const r of signups.rows) {
    const key = toIsoDate(r.day);
    const slot = map.get(key);
    if (slot) {
      slot.customers = r.customers;
      slot.tailors = r.tailors;
      slot.signups = r.total;
    }
  }
  for (const r of dau.rows) {
    const key = toIsoDate(r.day);
    const slot = map.get(key);
    if (slot) slot.dau = r.dau;
  }
  for (const r of messages.rows) {
    const key = toIsoDate(r.day);
    const slot = map.get(key);
    if (slot) slot.messages = r.messages;
  }

  return {
    range_days: range,
    series: Array.from(map.values()),
  };
}

function toIsoDate(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  return new Date(d).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 *  3. Cohort retention                                                *
 * ------------------------------------------------------------------ */

/**
 * Weekly cohort retention table. For each signup-week cohort, what % of
 * the cohort was active in week 0, 1, 2, … relative to signup.
 *
 * "Active" uses the same unified definition as DAU.
 *
 * Output:
 *   {
 *     weeks: 8,
 *     cohorts: [
 *       { cohort: '2026-04-21', size: 12, retention: [12, 8, 5, 3, ...] }, // counts
 *       ...
 *     ]
 *   }
 *
 * Frontend renders this as a heatmap; the row's first cell is always 100%
 * (everyone is "active" the week they sign up if they did anything).
 */
async function getCohorts({ weeks = COHORT_WEEKS_DEFAULT } = {}) {
  const range = clampInt(weeks, 2, COHORT_WEEKS_MAX, COHORT_WEEKS_DEFAULT);

  const { rows } = await knex.raw(
    `
    WITH user_cohorts AS (
      SELECT
        id AS user_id,
        DATE_TRUNC('week', created_at)::date AS cohort
      FROM users
      WHERE created_at >= DATE_TRUNC('week', NOW()) - (?::int || ' weeks')::interval
    ),
    user_activity AS (
      SELECT user_id, week_date FROM (
        SELECT sender_id  AS user_id, DATE_TRUNC('week', created_at)::date  AS week_date FROM messages
        UNION
        SELECT customer_id, DATE_TRUNC('week', created_at)::date FROM orders
        UNION
        SELECT tailor_id,   DATE_TRUNC('week', updated_at)::date FROM orders
        UNION
        SELECT tailor_id,   DATE_TRUNC('week', updated_at)::date FROM jobs
        UNION
        SELECT id, DATE_TRUNC('week', last_login_at)::date FROM users WHERE last_login_at IS NOT NULL
        UNION
        SELECT id, DATE_TRUNC('week', created_at)::date FROM users
      ) AS t
    )
    SELECT
      uc.cohort,
      COUNT(DISTINCT uc.user_id)::int AS cohort_size,
      ARRAY[
        COUNT(DISTINCT uc.user_id) FILTER (WHERE ua.week_date = uc.cohort)::int,
        COUNT(DISTINCT uc.user_id) FILTER (WHERE ua.week_date = uc.cohort + INTERVAL '1 week')::int,
        COUNT(DISTINCT uc.user_id) FILTER (WHERE ua.week_date = uc.cohort + INTERVAL '2 week')::int,
        COUNT(DISTINCT uc.user_id) FILTER (WHERE ua.week_date = uc.cohort + INTERVAL '3 week')::int,
        COUNT(DISTINCT uc.user_id) FILTER (WHERE ua.week_date = uc.cohort + INTERVAL '4 week')::int,
        COUNT(DISTINCT uc.user_id) FILTER (WHERE ua.week_date = uc.cohort + INTERVAL '5 week')::int,
        COUNT(DISTINCT uc.user_id) FILTER (WHERE ua.week_date = uc.cohort + INTERVAL '6 week')::int,
        COUNT(DISTINCT uc.user_id) FILTER (WHERE ua.week_date = uc.cohort + INTERVAL '7 week')::int,
        COUNT(DISTINCT uc.user_id) FILTER (WHERE ua.week_date = uc.cohort + INTERVAL '8 week')::int,
        COUNT(DISTINCT uc.user_id) FILTER (WHERE ua.week_date = uc.cohort + INTERVAL '9 week')::int,
        COUNT(DISTINCT uc.user_id) FILTER (WHERE ua.week_date = uc.cohort + INTERVAL '10 week')::int,
        COUNT(DISTINCT uc.user_id) FILTER (WHERE ua.week_date = uc.cohort + INTERVAL '11 week')::int
      ] AS retention
    FROM user_cohorts uc
    LEFT JOIN user_activity ua ON ua.user_id = uc.user_id
    GROUP BY uc.cohort
    ORDER BY uc.cohort DESC
  `,
    [range]
  );

  return {
    weeks: range,
    cohorts: rows.map((r) => ({
      cohort: toIsoDate(r.cohort),
      size: r.cohort_size,
      // Trim the retention array so we don't show future weeks (cells where
      // `cohort + offset > today` are not meaningful — the cohort hasn't had
      // a chance to retain there yet).
      retention: r.retention.slice(0, range + 1),
    })),
  };
}

/* ------------------------------------------------------------------ *
 *  4. Funnels                                                         *
 * ------------------------------------------------------------------ */

/**
 * Activation funnels (customer + tailor) and the order pipeline funnel,
 * all anchored to the supplied window.
 */
async function getFunnels({ days = RANGE_DAYS_DEFAULT } = {}) {
  const range = clampInt(days, 1, 365, RANGE_DAYS_DEFAULT);

  // Customer activation: signed_up → email_verified → onboarded → sent message
  // → HAS MEASUREMENTS (activation event) → placed order
  const customerQ = knex.raw(
    `
    WITH cohort AS (
      SELECT id, email_verified, onboarding_completed
      FROM users
      WHERE role = 'customer'
        AND created_at >= NOW() - (?::int || ' days')::interval
    )
    SELECT
      COUNT(*)::int                                                                         AS signed_up,
      COUNT(*) FILTER (WHERE email_verified)::int                                           AS email_verified,
      COUNT(*) FILTER (WHERE onboarding_completed)::int                                     AS onboarded,
      COUNT(*) FILTER (WHERE id IN (SELECT DISTINCT sender_id  FROM messages))::int         AS sent_message,
      COUNT(*) FILTER (WHERE id IN (SELECT DISTINCT user_id FROM measurement_history))::int AS has_measurements,
      COUNT(*) FILTER (WHERE id IN (SELECT DISTINCT customer_id FROM orders))::int          AS placed_order
    FROM cohort
  `,
    [range]
  );

  // Tailor activation: signed_up → email_verified → onboarded → storefront →
  // RECORDED MEASUREMENTS (activation event) → posted style → started job → completed order
  const tailorQ = knex.raw(
    `
    WITH cohort AS (
      SELECT u.id, u.email_verified, u.onboarding_completed, tp.storefront_setup_completed
      FROM users u
      LEFT JOIN tailor_profiles tp ON tp.user_id = u.id
      WHERE u.role = 'tailor'
        AND u.created_at >= NOW() - (?::int || ' days')::interval
    )
    SELECT
      COUNT(*)::int                                                                         AS signed_up,
      COUNT(*) FILTER (WHERE email_verified)::int                                           AS email_verified,
      COUNT(*) FILTER (WHERE onboarding_completed)::int                                     AS onboarded,
      COUNT(*) FILTER (WHERE storefront_setup_completed)::int                               AS storefront_done,
      COUNT(*) FILTER (WHERE id IN (SELECT DISTINCT tailor_id FROM measurement_history))::int AS recorded_measurements,
      COUNT(*) FILTER (WHERE id IN (SELECT DISTINCT tailor_id FROM marketplace_styles))::int AS posted_style,
      COUNT(*) FILTER (WHERE id IN (SELECT DISTINCT tailor_id FROM jobs))::int              AS started_job,
      COUNT(*) FILTER (
        WHERE id IN (SELECT DISTINCT tailor_id FROM orders WHERE status = 'completed')
      )::int                                                                                AS completed_order
    FROM cohort
  `,
    [range]
  );

  // Order pipeline funnel — counts of orders in each lifecycle status,
  // filtered to the window so we see *recent* health, not all-time skew.
  const ordersQ = knex.raw(
    `
    SELECT
      COUNT(*)::int                                                AS total,
      COUNT(*) FILTER (WHERE status = 'pending')::int              AS pending,
      COUNT(*) FILTER (WHERE status = 'accepted')::int             AS accepted,
      COUNT(*) FILTER (WHERE status = 'in_progress')::int          AS in_progress,
      COUNT(*) FILTER (WHERE status = 'completed')::int            AS completed,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int            AS cancelled
    FROM orders
    WHERE created_at >= NOW() - (?::int || ' days')::interval
  `,
    [range]
  );

  // Job pipeline funnel — same idea on the tailor side
  const jobsQ = knex.raw(
    `
    SELECT
      COUNT(*)::int                                                AS total,
      COUNT(*) FILTER (WHERE status = 'cutting')::int              AS cutting,
      COUNT(*) FILTER (WHERE status = 'stitching')::int            AS stitching,
      COUNT(*) FILTER (WHERE status = 'ready')::int                AS ready,
      COUNT(*) FILTER (WHERE status = 'delivered')::int            AS delivered
    FROM jobs
    WHERE created_at >= NOW() - (?::int || ' days')::interval
  `,
    [range]
  );

  const [customer, tailor, orders, jobs] = await Promise.all([customerQ, tailorQ, ordersQ, jobsQ]);

  return {
    range_days: range,
    customer: customer.rows[0],
    tailor: tailor.rows[0],
    orders: orders.rows[0],
    jobs: jobs.rows[0],
  };
}

/* ------------------------------------------------------------------ *
 *  5. Marketplace top-N                                               *
 * ------------------------------------------------------------------ */

async function getMarketplaceTop({ limit = 10 } = {}) {
  const lim = clampInt(limit, 1, 50, 10);

  const topStylesQ = knex.raw(
    `
    SELECT
      ms.id,
      ms.title,
      ms.price,
      ms.category,
      ms.view_count,
      ms.favourite_count,
      u.name AS tailor_name
    FROM marketplace_styles ms
    LEFT JOIN users u ON u.id = ms.tailor_id
    WHERE ms.is_active = true
    ORDER BY ms.favourite_count DESC, ms.view_count DESC
    LIMIT ?
  `,
    [lim]
  );

  const topTailorsQ = knex.raw(
    `
    SELECT
      u.id,
      u.name,
      u.username,
      u.avatar_url,
      tp.rating_avg,
      tp.rating_count,
      COUNT(DISTINCT o.id)::int AS orders_received,
      COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'completed')::int AS orders_completed
    FROM users u
    LEFT JOIN tailor_profiles tp ON tp.user_id = u.id
    LEFT JOIN orders o ON o.tailor_id = u.id
    WHERE u.role = 'tailor' AND u.is_active = true
    GROUP BY u.id, tp.rating_avg, tp.rating_count
    ORDER BY orders_received DESC, tp.rating_avg DESC NULLS LAST
    LIMIT ?
  `,
    [lim]
  );

  const notifsQ = knex.raw(`
    SELECT
      type,
      COUNT(*)::int                              AS sent,
      COUNT(*) FILTER (WHERE is_read)::int       AS read,
      ROUND(AVG(CASE WHEN is_read THEN 100.0 ELSE 0.0 END)::numeric, 1)::float AS read_rate_pct
    FROM notifications
    WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY type
    ORDER BY sent DESC
  `);

  const [styles, tailors, notifs] = await Promise.all([topStylesQ, topTailorsQ, notifsQ]);

  return {
    top_styles: styles.rows,
    top_tailors: tailors.rows,
    notifications_30d: notifs.rows,
  };
}

/* ------------------------------------------------------------------ *
 *  6. Referrals — viral funnel + top inviters                         *
 * ------------------------------------------------------------------ */

async function getReferrals({ limit = 10 } = {}) {
  const lim = clampInt(limit, 1, 50, 10);

  const funnelQ = knex.raw(`
    SELECT
      COUNT(*)::int                                              AS invited,
      COUNT(*) FILTER (WHERE status IN ('joined', 'rewarded'))::int AS joined,
      COUNT(*) FILTER (WHERE status = 'rewarded')::int           AS rewarded,
      COUNT(DISTINCT referrer_id)::int                           AS active_inviters
    FROM referrals
  `);

  // K-factor proxy: of users who SIGNED UP, what fraction came in through
  // a referral? This is a useful viral coefficient even before rewards land.
  const kFactorQ = knex.raw(`
    SELECT
      COUNT(*)::int                                  AS total_users,
      COUNT(referred_by)::int                        AS referred_users
    FROM users
  `);

  const topQ = knex.raw(
    `
    SELECT
      u.id,
      u.name,
      u.username,
      u.avatar_url,
      u.referral_code,
      COUNT(r.id)::int                                                   AS invites,
      COUNT(r.id) FILTER (WHERE r.status IN ('joined','rewarded'))::int  AS joined,
      COUNT(r.id) FILTER (WHERE r.status = 'rewarded')::int              AS rewarded
    FROM users u
    JOIN referrals r ON r.referrer_id = u.id
    GROUP BY u.id
    ORDER BY joined DESC, invites DESC
    LIMIT ?
  `,
    [lim]
  );

  const [funnel, kf, top] = await Promise.all([funnelQ, kFactorQ, topQ]);

  const f = funnel.rows[0];
  const k = kf.rows[0];

  return {
    funnel: {
      invited: f.invited,
      joined: f.joined,
      rewarded: f.rewarded,
      active_inviters: f.active_inviters,
      join_rate_pct: f.invited > 0 ? +(f.joined / f.invited * 100).toFixed(1) : 0,
    },
    k_factor: {
      total_users: k.total_users,
      referred_users: k.referred_users,
      // Share of the user base who came in via a referral. Not a true
      // viral K-factor (we'd need invites-per-user × accept-rate for that)
      // but a meaningful proxy for "how much of growth is organic-viral".
      share_pct: k.total_users > 0 ? +(k.referred_users / k.total_users * 100).toFixed(1) : 0,
    },
    top_referrers: top.rows,
  };
}

module.exports = {
  getOverview,
  getTimeseries,
  getCohorts,
  getFunnels,
  getMarketplaceTop,
  getReferrals,
};

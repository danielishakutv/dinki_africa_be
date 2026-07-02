/**
 * Easier signup: allow email OR phone, drop OTP-at-signup in favour of a 7-day
 * verify grace period + an email verification link.
 *
 *  - email becomes NULLABLE (phone-only signups). The UNIQUE constraint stays;
 *    Postgres allows many NULLs, so multiple phone-only users are fine.
 *  - verify_deadline: when an unverified account must verify by (set to
 *    created_at + 7 days at signup). NULL = grandfathered (never forced).
 *  - email_verify_token: single-use token behind the verification link.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('users', (t) => {
    t.string('email', 255).nullable().alter();
  });

  const hasDeadline = await knex.schema.hasColumn('users', 'verify_deadline');
  const hasToken = await knex.schema.hasColumn('users', 'email_verify_token');
  await knex.schema.alterTable('users', (t) => {
    if (!hasDeadline) t.timestamp('verify_deadline', { useTz: true });
    if (!hasToken) t.string('email_verify_token', 64);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('verify_deadline');
    t.dropColumn('email_verify_token');
  });
  // NOTE: not restoring NOT NULL on email — phone-only rows may now exist and a
  // blind re-add would fail. Left nullable on purpose.
};

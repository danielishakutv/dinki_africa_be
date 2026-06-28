/**
 * Promote the platform owner accounts to superadmin (full admin access).
 *
 * Case-insensitive match. No-op for any address that doesn't exist yet — in that
 * case create/verify the account, then run:
 *   docker compose exec dinki-api npm run promote-admin -- --email <e> --role superadmin
 *
 * Note: this flips role only. If an account was previously a tailor, its
 * tailor_profile is left in place (harmless); the app routes admins to /admin.
 */
const ADMIN_EMAILS = ['tokotechnologies@gmail.com', 'talk2ishakudaniel@gmail.com'];

exports.up = async function (knex) {
  for (const email of ADMIN_EMAILS) {
    const n = await knex('users')
      .whereRaw('lower(email) = ?', [email])
      .update({ role: 'superadmin', updated_at: new Date() });
    // eslint-disable-next-line no-console
    console.log(`[MIGRATION 027] ${email}: ${n ? 'promoted to superadmin' : 'no account found (skip)'}`);
  }
};

exports.down = async function () {
  // No-op: original roles are unknown, so we can't safely revert.
};

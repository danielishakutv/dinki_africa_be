#!/usr/bin/env node
/**
 * Set (reset) a user's password from the server shell — for support/recovery when
 * someone is locked out and email reset isn't convenient.
 *
 * CLI-only by design (no HTTP endpoint). Marks the account verified + active and
 * clears any failed-login lock so the user can log in immediately. All existing
 * sessions are revoked so the change takes effect everywhere.
 *
 * Usage:
 *   node scripts/set-password.js --email user@example.com --password 'NewPass123'
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/config/database');

const SALT_ROUNDS = 12;

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--email') args.email = argv[++i];
    else if (key === '--password') args.password = argv[++i];
    else if (key === '--help' || key === '-h') args.help = true;
  }
  return args;
}

async function main() {
  const { email, password, help } = parseArgs(process.argv);

  if (help || !email || !password) {
    console.log("\nUsage: node scripts/set-password.js --email <email> --password '<newPassword>'\n");
    process.exit(help ? 0 : 1);
  }

  if (password.length < 8 || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    console.error('[ERROR] Password must be at least 8 chars and include an uppercase letter and a digit.');
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await db('users').whereRaw('lower(email) = ?', [normalizedEmail]).first();
  if (!user) {
    console.error(`[ERROR] No user found with email ${normalizedEmail}`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  await db.transaction(async (trx) => {
    await trx('users').where({ id: user.id }).update({
      password_hash: passwordHash,
      email_verified: true,
      account_status: 'active',
      failed_login_count: 0,
      locked_until: null,
      updated_at: new Date(),
    });
    // Revoke existing sessions so the new password takes effect everywhere.
    await trx('refresh_tokens').where({ user_id: user.id }).del();
  });

  console.log(`[OK] Password reset for ${normalizedEmail} (role: ${user.role}). Account is verified + unlocked.`);
  console.log('     Ask the user to log in with the new password.');
}

main()
  .catch((err) => {
    console.error('[FATAL]', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await db.destroy();
  });

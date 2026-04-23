#!/usr/bin/env node
/**
 * Promote an existing user to `admin` or `superadmin`.
 *
 * This is a CLI-only tool — there is NO HTTP endpoint that changes roles,
 * by design. Run it from the server shell (or `docker exec`), never expose
 * it to the network.
 *
 * Usage:
 *   node scripts/promote-admin.js --email user@example.com --role superadmin
 *
 * Safety rails:
 *   - The target user must already exist and be email-verified.
 *   - Refuses to change someone who is already at or above the target role
 *     (prevents accidental "re-promotes" that noise up the audit log).
 *   - Writes an audit_log row for every successful promotion.
 *   - All refresh tokens for the user are invalidated, forcing a fresh
 *     login so the new role is picked up in the JWT immediately.
 */
require('dotenv').config();
const db = require('../src/config/database');

const VALID_ROLES = ['admin', 'superadmin'];
const ROLE_RANK = { customer: 0, tailor: 0, admin: 1, superadmin: 2 };

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--email') args.email = argv[++i];
    else if (key === '--role') args.role = argv[++i];
    else if (key === '--help' || key === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log(`
Usage: node scripts/promote-admin.js --email <email> --role <admin|superadmin>

Promotes an existing, verified user to the given admin role.
`);
}

async function main() {
  const { email, role, help } = parseArgs(process.argv);

  if (help || !email || !role) {
    usage();
    process.exit(help ? 0 : 1);
  }

  if (!VALID_ROLES.includes(role)) {
    console.error(`[ERROR] --role must be one of: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await db('users').where({ email: normalizedEmail }).first();

  if (!user) {
    console.error(`[ERROR] No user found with email ${normalizedEmail}`);
    process.exit(1);
  }

  if (!user.email_verified) {
    console.error(`[ERROR] User ${normalizedEmail} has not verified their email. Refusing to promote.`);
    process.exit(1);
  }

  if (ROLE_RANK[user.role] >= ROLE_RANK[role]) {
    console.log(`[SKIP] User ${normalizedEmail} already has role "${user.role}" (>= "${role}"). No change.`);
    process.exit(0);
  }

  const previousRole = user.role;

  await db.transaction(async (trx) => {
    await trx('users')
      .where({ id: user.id })
      .update({ role, updated_at: new Date() });

    // Invalidate existing sessions so the user picks up the new role on next login.
    await trx('refresh_tokens').where({ user_id: user.id }).del();

    await trx('audit_log').insert({
      actor_id: user.id, // self-record; no HTTP actor in CLI context
      action: 'role.promote',
      target_type: 'user',
      target_id: user.id,
      metadata: JSON.stringify({
        previous_role: previousRole,
        new_role: role,
        via: 'cli:promote-admin',
      }),
    });
  });

  console.log(`[OK] ${normalizedEmail}: ${previousRole} → ${role}`);
  console.log(`     Active sessions revoked. User must log in again to receive the new role.`);
}

main()
  .catch((err) => {
    console.error('[FATAL]', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await db.destroy();
  });

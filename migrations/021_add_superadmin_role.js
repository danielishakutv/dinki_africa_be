/**
 * Extend the users.role CHECK constraint to allow 'superadmin' alongside
 * 'customer', 'tailor', 'admin'. Non-breaking: existing rows already match.
 *
 * The original constraint was created via knex .checkIn() in migration 001
 * and its name is Postgres-generated. We look it up dynamically so this
 * migration works regardless of the auto-generated name.
 */
exports.up = async function (knex) {
  // Narrow match: only CHECK constraints on users whose definition references
  // the role column. Avoids dropping unrelated future constraints by accident.
  const { rows } = await knex.raw(`
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND contype  = 'c'
      AND pg_get_constraintdef(oid) ~* '\\mrole\\M.*=\\s*ANY|\\mrole\\M.*IN\\s*\\('
  `);

  for (const row of rows) {
    await knex.raw(`ALTER TABLE users DROP CONSTRAINT IF EXISTS "${row.conname}"`);
  }

  await knex.raw(`
    ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('customer', 'tailor', 'admin', 'superadmin'))
  `);
};

exports.down = async function (knex) {
  // Revert to the original three-value constraint. Will fail if any
  // superadmin rows exist — that's the correct, safe behaviour.
  await knex.raw(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await knex.raw(`
    ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('customer', 'tailor', 'admin'))
  `);
};

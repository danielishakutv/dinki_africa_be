/**
 * Add unique username column to users table.
 * Nullable because existing users don't have one yet.
 * Once set, only admins can change it.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('users', (t) => {
    t.string('username', 30).unique().nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('username');
  });
};

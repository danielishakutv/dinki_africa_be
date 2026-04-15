/**
 * Unified Customer Identity
 *
 * - Add account_status to users (active vs inactive placeholder accounts)
 * - Create measurement_history table for audit trail
 * - Add deleted_at to customers for soft delete
 */
exports.up = async function (knex) {
  // 1. Add account_status to users table
  await knex.schema.alterTable('users', (t) => {
    t.string('account_status', 20).notNullable().defaultTo('active');
  });

  // 2. Create measurement_history table
  await knex.schema.createTable('measurement_history', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('tailor_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('customer_id').notNullable().references('id').inTable('customers').onDelete('CASCADE');
    t.jsonb('measurements').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['user_id', 'created_at'], 'idx_mhist_user');
    t.index(['customer_id', 'created_at'], 'idx_mhist_customer');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('measurement_history');

  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('account_status');
  });
};

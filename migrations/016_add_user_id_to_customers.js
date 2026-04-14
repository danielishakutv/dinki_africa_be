/**
 * Add optional user_id to customers table.
 * Links a tailor's local customer record to a platform user account.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('customers', (t) => {
    t.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.unique(['tailor_id', 'user_id'], { indexName: 'uq_customers_tailor_user' });
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('customers', (t) => {
    t.dropUnique(['tailor_id', 'user_id'], 'uq_customers_tailor_user');
    t.dropColumn('user_id');
  });
};

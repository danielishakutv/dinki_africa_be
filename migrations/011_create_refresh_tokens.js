exports.up = async function (knex) {
  await knex.schema.createTable('refresh_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('token_hash', 255).notNullable();
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    t.index('user_id', 'idx_refresh_tokens_user');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('refresh_tokens');
};

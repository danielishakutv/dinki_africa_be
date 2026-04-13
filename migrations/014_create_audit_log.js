exports.up = async function (knex) {
  await knex.schema.createTable('audit_log', (t) => {
    t.bigIncrements('id').primary();
    t.uuid('actor_id').references('id').inTable('users');
    t.string('action', 100).notNullable();
    t.string('target_type', 50);
    t.uuid('target_id');
    t.jsonb('metadata').defaultTo('{}');
    t.specificType('ip_address', 'INET');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('audit_log');
};

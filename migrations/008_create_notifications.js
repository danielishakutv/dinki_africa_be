exports.up = async function (knex) {
  await knex.schema.createTable('notifications', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('type', 30).notNullable()
      .checkIn(['job', 'payment', 'message', 'review', 'order', 'system', 'reminder']);
    t.string('title', 200).notNullable();
    t.text('message');
    t.jsonb('metadata').defaultTo('{}');
    t.boolean('is_read').defaultTo(false);
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC)
  `);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('notifications');
};

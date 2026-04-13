exports.up = async function (knex) {
  await knex.schema.createTable('conversations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('participant_1').notNullable().references('id').inTable('users');
    t.uuid('participant_2').notNullable().references('id').inTable('users');
    t.timestamp('last_message_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.unique(['participant_1', 'participant_2']);
  });

  await knex.schema.createTable('messages', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('conversation_id').notNullable().references('id').inTable('conversations').onDelete('CASCADE');
    t.uuid('sender_id').notNullable().references('id').inTable('users');
    t.text('text');
    t.string('image_url', 500);
    t.boolean('is_read').defaultTo(false);
    t.timestamp('read_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC)
  `);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('messages');
  await knex.schema.dropTableIfExists('conversations');
};

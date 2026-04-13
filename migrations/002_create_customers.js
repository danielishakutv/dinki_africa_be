exports.up = async function (knex) {
  await knex.schema.createTable('customers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tailor_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('name', 100).notNullable();
    t.string('phone', 20);
    t.string('email', 255);
    t.string('location', 200);
    t.string('initials', 3);
    t.string('avatar_color', 50);
    t.jsonb('measurements').defaultTo('{}');
    t.text('measurement_notes');
    t.jsonb('custom_fields').defaultTo('[]');
    t.timestamps(true, true);

    t.index('tailor_id', 'idx_customers_tailor');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('customers');
};

exports.up = async function (knex) {
  await knex.schema.createTable('jobs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tailor_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('customer_id').notNullable().references('id').inTable('customers').onDelete('CASCADE');
    t.string('title', 200).notNullable();
    t.text('description');
    t.string('style_image_url', 500);
    t.string('status', 20).notNullable().defaultTo('cutting')
      .checkIn(['cutting', 'stitching', 'ready', 'delivered']);
    t.date('due_date');
    t.integer('price');
    t.boolean('invoiced').defaultTo(false);
    t.timestamp('invoiced_at', { useTz: true });
    t.timestamp('delivered_at', { useTz: true });
    t.timestamps(true, true);

    t.index(['tailor_id', 'status'], 'idx_jobs_tailor');
  });

  await knex.raw(`
    CREATE INDEX idx_jobs_due ON jobs(due_date) WHERE status != 'delivered'
  `);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('jobs');
};

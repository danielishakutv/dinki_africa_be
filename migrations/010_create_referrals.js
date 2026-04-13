exports.up = async function (knex) {
  await knex.schema.createTable('referrals', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('referrer_id').notNullable().references('id').inTable('users');
    t.uuid('referee_id').references('id').inTable('users');
    t.string('referee_email', 255);
    t.string('status', 20).defaultTo('invited').checkIn(['invited', 'joined', 'rewarded']);
    t.integer('reward_amount').defaultTo(0);
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('referrals');
};

exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE analytics_events (
      id              BIGSERIAL PRIMARY KEY,
      event_type      VARCHAR(50) NOT NULL,
      user_id         UUID REFERENCES users(id),
      session_id      VARCHAR(36),
      page_path       VARCHAR(255),
      element_id      VARCHAR(100),
      metadata        JSONB DEFAULT '{}',
      device_type     VARCHAR(20),
      os              VARCHAR(50),
      browser         VARCHAR(50),
      screen_width    SMALLINT,
      connection      VARCHAR(20),
      country         VARCHAR(3),
      region          VARCHAR(100),
      city            VARCHAR(100),
      ip_hash         VARCHAR(64),
      response_time   SMALLINT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    ) PARTITION BY RANGE (created_at)
  `);

  // Create partitions for current and next month
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const pad = (n) => String(n).padStart(2, '0');

  await knex.raw(`
    CREATE TABLE analytics_events_${year}_${pad(month)}
    PARTITION OF analytics_events
    FOR VALUES FROM ('${year}-${pad(month)}-01') TO ('${nextYear}-${pad(nextMonth)}-01')
  `);

  const nextNextMonth = nextMonth === 12 ? 1 : nextMonth + 1;
  const nextNextYear = nextMonth === 12 ? nextYear + 1 : nextYear;

  await knex.raw(`
    CREATE TABLE analytics_events_${nextYear}_${pad(nextMonth)}
    PARTITION OF analytics_events
    FOR VALUES FROM ('${nextYear}-${pad(nextMonth)}-01') TO ('${nextNextYear}-${pad(nextNextMonth)}-01')
  `);

  await knex.raw('CREATE INDEX idx_analytics_type_date ON analytics_events(event_type, created_at)');
  await knex.raw('CREATE INDEX idx_analytics_user_date ON analytics_events(user_id, created_at)');
  await knex.raw('CREATE INDEX idx_analytics_session ON analytics_events(session_id)');
};

exports.down = async function (knex) {
  await knex.raw('DROP TABLE IF EXISTS analytics_events CASCADE');
};

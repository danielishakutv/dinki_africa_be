/**
 * Retarget every foreign key that references `users` so that
 * `DELETE FROM users` works cleanly.
 *
 * Before this migration, most user-referencing FKs had no ON DELETE action
 * (default NO ACTION), so deleting a user fails with a FK violation. That's
 * fine for normal operation but blocks legitimate admin flows:
 *
 *   - Anonymize  → wipes PII, keeps the row. FK behaviour irrelevant.
 *   - Hard delete → physically removes the row. Needs every child row to
 *                   either cascade away or have its pointer set to NULL.
 *
 * Policy:
 *   CASCADE  — rows belong solely to that user (orders, reviews, marketplace
 *              styles, conversations/messages, referrer-side of referrals).
 *              Deleting the user deletes the row.
 *   SET NULL — rows are platform content that should outlive the user
 *              (articles, marketplace fabrics, verified_by pointer, audit
 *              log actor, self-ref referred_by, referee-side of referrals).
 *              Deleting the user keeps the row but nulls the pointer.
 *
 * This migration only changes constraint metadata. No data rows are read,
 * written, moved, or touched.
 */

const CHANGES = [
  // CASCADE — row is fundamentally "owned" by the user
  { table: 'orders',             column: 'customer_id',    onDelete: 'CASCADE' },
  { table: 'orders',             column: 'tailor_id',      onDelete: 'CASCADE' },
  { table: 'reviews',            column: 'tailor_id',      onDelete: 'CASCADE' },
  { table: 'reviews',            column: 'customer_id',    onDelete: 'CASCADE' },
  { table: 'conversations',      column: 'participant_1',  onDelete: 'CASCADE' },
  { table: 'conversations',      column: 'participant_2',  onDelete: 'CASCADE' },
  { table: 'messages',           column: 'sender_id',      onDelete: 'CASCADE' },
  { table: 'marketplace_styles', column: 'tailor_id',      onDelete: 'CASCADE' },
  { table: 'referrals',          column: 'referrer_id',    onDelete: 'CASCADE' },

  // SET NULL — content should survive the user
  { table: 'fabrics',             column: 'seller_id',     onDelete: 'SET NULL' },
  { table: 'articles',            column: 'author_id',     onDelete: 'SET NULL' },
  { table: 'referrals',           column: 'referee_id',    onDelete: 'SET NULL' },
  { table: 'audit_log',           column: 'actor_id',      onDelete: 'SET NULL' },
  { table: 'users',               column: 'referred_by',   onDelete: 'SET NULL' },
  { table: 'tailor_profiles',     column: 'verified_by',   onDelete: 'SET NULL' },
];

/**
 * Find the existing single-column FK on (table, column) → users.id and
 * recreate it with the desired ON DELETE clause.
 */
async function retargetFk(knex, { table, column, onDelete }) {
  const { rows } = await knex.raw(`
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class t ON t.oid = con.conrelid
    JOIN pg_class r ON r.oid = con.confrelid
    WHERE t.relname = ?
      AND r.relname = 'users'
      AND con.contype = 'f'
      AND array_length(con.conkey, 1) = 1
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = con.conrelid
          AND a.attname   = ?
          AND a.attnum    = ANY(con.conkey)
      )
  `, [table, column]);

  for (const row of rows) {
    await knex.raw(`ALTER TABLE "${table}" DROP CONSTRAINT "${row.conname}"`);
  }

  await knex.raw(`
    ALTER TABLE "${table}"
    ADD FOREIGN KEY ("${column}") REFERENCES users(id) ON DELETE ${onDelete}
  `);
}

exports.up = async function (knex) {
  for (const change of CHANGES) {
    await retargetFk(knex, change);
  }
};

exports.down = async function (knex) {
  // Restore every FK to its original behaviour (NO ACTION — i.e. no ON DELETE
  // clause), matching the state before this migration ran.
  for (const change of CHANGES) {
    await retargetFk(knex, { ...change, onDelete: 'NO ACTION' });
  }
};

/**
 * Normalize every existing phone number in `users` and `customers` to the
 * canonical Nigerian E.164 form (+234XXXXXXXXXX) and surface any duplicate
 * accounts that surface as a result.
 *
 * Why this matters:
 *   Until now we accepted phones in any shape — "0808...", "+234 808...",
 *   "234-808-...", with or without spaces. That meant the same person could
 *   be registered twice if a tailor typed the local form one day and the
 *   international form another. Application-layer validation has now been
 *   tightened (every write path runs phoneBody() before persisting), but
 *   already-stored rows still hold the legacy mixed shapes — this migration
 *   rewrites them so the application's identity checks (findMatchingUser,
 *   the new uniqueness guards) actually see one entity per phone.
 *
 * What this migration does NOT do:
 *   It does not drop, merge, or auto-link duplicate users. If two user rows
 *   end up with the same phone after normalization, both are left in place
 *   and the duplicate is logged for manual review. Auto-merging accounts
 *   risks losing measurement history, conversations, and orders, so that
 *   call belongs to a human, not a migration.
 *
 *   A unique index on users.phone is intentionally NOT added here either —
 *   adding it would fail this migration if any duplicates exist. Once the
 *   reported duplicates are resolved by hand, a follow-up migration can
 *   add `CREATE UNIQUE INDEX ... WHERE phone IS NOT NULL`.
 *
 * Down:
 *   No-op. The legacy mixed-format strings are intentionally not preserved —
 *   reversing normalization would just re-introduce the duplicate-account
 *   bug it exists to fix.
 */

const { normalizeNigerianPhone } = require('../src/utils/phone');

async function normalizeTable(knex, table) {
  const rows = await knex(table).whereNotNull('phone').select('id', 'phone');
  let updated = 0;
  let unchanged = 0;
  let invalid = 0;

  for (const row of rows) {
    const result = normalizeNigerianPhone(row.phone);
    if (!result.ok || result.value === null) {
      // Bad data we can't safely transform — leave it alone, surface it.
      console.warn(
        `[migration 023] ${table} ${row.id}: cannot normalize "${row.phone}" — left as-is`
      );
      invalid++;
      continue;
    }
    if (result.value === row.phone) {
      unchanged++;
      continue;
    }
    await knex(table).where({ id: row.id }).update({ phone: result.value });
    updated++;
  }

  console.log(
    `[migration 023] ${table}: scanned=${rows.length} updated=${updated} ` +
    `already-canonical=${unchanged} invalid=${invalid}`
  );
}

async function reportUserDuplicates(knex) {
  const { rows } = await knex.raw(`
    SELECT phone, ARRAY_AGG(id::text ORDER BY created_at) AS user_ids,
           ARRAY_AGG(email ORDER BY created_at) AS emails,
           COUNT(*)::int AS n
    FROM users
    WHERE phone IS NOT NULL
    GROUP BY phone
    HAVING COUNT(*) > 1
    ORDER BY n DESC, phone
  `);

  if (rows.length === 0) {
    console.log('[migration 023] no duplicate users by normalized phone — clean.');
    return;
  }

  console.warn(
    `[migration 023] ${rows.length} duplicate phone group(s) detected in users — ` +
    'review manually (consider anonymizing or hard-deleting the stale duplicate via /admin/users):'
  );
  for (const r of rows) {
    const ids = Array.isArray(r.user_ids) ? r.user_ids.join(', ') : r.user_ids;
    const emails = Array.isArray(r.emails) ? r.emails.join(', ') : r.emails;
    console.warn(`  phone=${r.phone}  count=${r.n}  user_ids=[${ids}]  emails=[${emails}]`);
  }
}

exports.up = async function (knex) {
  await normalizeTable(knex, 'users');
  await normalizeTable(knex, 'customers');
  await reportUserDuplicates(knex);
};

exports.down = async function () {
  // Intentional no-op — see header comment.
};

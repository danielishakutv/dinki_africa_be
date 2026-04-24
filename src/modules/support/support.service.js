/**
 * Support ticket pipeline.
 *
 * One endpoint — POST /v1/support/ticket — fans out to:
 *   1. Email to the support inbox + CC (primary recipient: our ops).
 *   2. In-app notification for every admin/superadmin, with a live
 *      socket emit so they see it instantly.
 *   3. An audit_log row so we can trace tickets even without a table.
 *
 * No DB table for tickets yet — tickets flow through email + notifications
 * rather than a queue we own. If that changes, swap this service out.
 */

const crypto = require('crypto');
const knex = require('../../config/database');
const emailService = require('../../services/emailService');

const SUPPORT_TO = 'tokotechnologies@gmail.com';
const SUPPORT_CC = 'talk2ishakudaniel@gmail.com';

function generateTicketRef() {
  // 6 hex chars ≈ 16M unique refs — plenty for a fresh platform and
  // short enough to quote verbatim in Slack / WhatsApp.
  return `DINKI-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

async function createTicket({ submitter, form, ip, io }) {
  const ticketRef = generateTicketRef();

  // 1. Email to support inbox. Fire-and-forget so SMTP latency never
  //    blocks the user-facing response — tickets are durable via the
  //    notification + audit log paths below even if the email fails.
  emailService
    .sendSupportTicket({
      to: SUPPORT_TO,
      cc: SUPPORT_CC,
      ticketRef,
      name: form.name,
      email: form.email,
      category: form.category,
      subject: form.subject,
      message: form.message,
      submitter,
    })
    .catch((err) => console.error(`[SUPPORT] email failed for ${ticketRef}:`, err.message));

  // 2. Notify every active admin + superadmin.
  const admins = await knex('users')
    .whereIn('role', ['admin', 'superadmin'])
    .where('is_active', true)
    .where('account_status', 'active')
    .select('id', 'name', 'email');

  let notified = 0;
  if (admins.length > 0) {
    const preview = form.message.length > 500
      ? `${form.message.slice(0, 500)}…`
      : form.message;

    const rows = admins.map((a) => ({
      user_id: a.id,
      type: 'system',
      title: `New support ticket: ${form.subject}`,
      message: `From ${form.name} <${form.email}> · ${form.category}\n\n${preview}`,
      metadata: JSON.stringify({
        ticketRef,
        category: form.category,
        senderName: form.name,
        senderEmail: form.email,
        submitterId: submitter?.id || null,
      }),
    }));

    const inserted = await knex('notifications')
      .insert(rows)
      .returning(['id', 'user_id', 'type', 'title', 'message', 'metadata', 'is_read', 'created_at']);

    notified = inserted.length;

    if (io) {
      for (const n of inserted) {
        io.to(`user:${n.user_id}`).emit('notification:new', n);
      }
    }
  }

  // 3. Audit trail — no target_id because we don't store tickets in a
  //    table. The ticketRef is sufficient to join email threads to logs.
  await knex('audit_log').insert({
    actor_id: submitter?.id || null,
    action: 'support.ticket_created',
    target_type: 'support_ticket',
    metadata: JSON.stringify({
      ticketRef,
      category: form.category,
      subject: form.subject,
      senderName: form.name,
      senderEmail: form.email,
      admins_notified: notified,
    }),
    ip_address: ip || null,
  });

  console.log(
    `[SUPPORT] ticket=${ticketRef} from=${form.email} ` +
    `submitter=${submitter?.email || '(anon)'} notified_admins=${notified}`
  );

  return { ticketRef, adminsNotified: notified };
}

module.exports = { createTicket };

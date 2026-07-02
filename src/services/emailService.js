/**
 * Email Service — Sends transactional emails via local Postfix
 * Drop this into: backend/src/services/emailService.js
 */
const nodemailer = require('nodemailer');
const { emailTemplates } = require('./emailTemplates');

// Transport selection:
//   - RESEND_API_KEY set  → send via Resend's HTTP API (recommended; a verified
//     domain with SPF/DKIM/DMARC lands in the inbox, not spam).
//   - otherwise           → fall back to the local Postfix relay (old behaviour).
// Flip to Resend by adding the env var + restarting the API container — no code
// change or redeploy required once this file is live.
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const FROM_ADDRESS = process.env.EMAIL_FROM || '"Dinki Africa" <no-reply@dinki.africa>';
const SUPPORT_ADDRESS = process.env.EMAIL_SUPPORT || 'support@dinki.africa';

// Postfix transport is created lazily so we never open an SMTP pool when Resend
// is the active transport.
let _transporter = null;
function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'host.docker.internal',
      port: 25,
      secure: false,
      tls: { rejectUnauthorized: false },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    });
  }
  return _transporter;
}

// Send one email through Resend's HTTP API (native fetch — Node 18+).
async function sendViaResend({ from, to, cc, subject, html, text, replyTo }) {
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text || subject,
      ...(cc ? { cc: Array.isArray(cc) ? cc : [cc] } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  let data = {};
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    throw new Error(data.message || `Resend API error (${res.status})`);
  }
  return { messageId: data.id };
}

/**
 * Send a raw email. `cc` and `replyTo` are opt-in; omitting them keeps
 * existing transactional sends (OTP, welcome, reset) unchanged.
 */
async function sendEmail({ to, cc, subject, html, text, from, replyTo }) {
  const fromAddr = from || FROM_ADDRESS;
  try {
    const info = RESEND_API_KEY
      ? await sendViaResend({ from: fromAddr, to, cc, subject, html, text, replyTo })
      : await getTransporter().sendMail({
          from: fromAddr,
          to,
          ...(cc ? { cc } : {}),
          ...(replyTo ? { replyTo } : {}),
          subject,
          html,
          text: text || subject, // plain-text fallback
        });
    console.log(`[EMAIL] Sent to ${to}${cc ? ` (cc ${cc})` : ''} via ${RESEND_API_KEY ? 'Resend' : 'Postfix'} — id: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error(`[EMAIL] Failed to send to ${to}:`, err.message);
    throw err;
  }
}

/**
 * Send OTP verification email (signup)
 */
async function sendOTP(email, otp, name) {
  return sendEmail({
    to: email,
    subject: `${otp} is your Dinki Africa verification code`,
    html: emailTemplates.otp({ otp, name }),
    text: `Hi ${name || 'there'}, your verification code is: ${otp}. It expires in 10 minutes.`,
  });
}

/**
 * Send password reset email
 */
async function sendPasswordReset(email, resetToken, name) {
  const resetUrl = `${process.env.FRONTEND_URL || 'https://dinki.africa'}/reset-password?token=${resetToken}`;
  return sendEmail({
    to: email,
    subject: 'Reset your Dinki Africa password',
    html: emailTemplates.passwordReset({ resetUrl, name }),
    text: `Hi ${name || 'there'}, reset your password here: ${resetUrl}. This link expires in 1 hour.`,
  });
}

/**
 * Send an email-verification LINK (new signup flow — no OTP). The user is already
 * logged in; clicking the link confirms ownership within the 7-day grace window.
 */
async function sendVerificationEmail(email, verifyUrl, name) {
  const safeName = name || 'there';
  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#ffffff;color:#1a0a00">
    <div style="text-align:center;margin-bottom:20px">
      <div style="display:inline-block;background:linear-gradient(135deg,#e8a020,#c87d10);color:#fff;font-weight:800;font-size:18px;padding:10px 16px;border-radius:12px">Dinki Africa</div>
    </div>
    <h1 style="font-size:20px;margin:0 0 12px">Confirm your email</h1>
    <p style="font-size:14px;line-height:1.6;color:#5a4a3a;margin:0 0 20px">Hi ${safeName}, welcome to Dinki! You're already signed in. Confirm your email to keep your account secure and unlock everything — it only takes a tap.</p>
    <a href="${verifyUrl}" style="display:inline-block;background:linear-gradient(135deg,#e8a020,#c87d10);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:12px">Verify my email</a>
    <p style="font-size:12px;color:#9a8a7a;margin:20px 0 0;line-height:1.6">If the button doesn't work, paste this link into your browser:<br/><a href="${verifyUrl}" style="color:#c87d10;word-break:break-all">${verifyUrl}</a></p>
  </div>`;
  return sendEmail({
    to: email,
    subject: 'Verify your email — Dinki Africa',
    html,
    text: `Hi ${safeName}, verify your Dinki Africa email: ${verifyUrl}`,
  });
}

/**
 * Send welcome email after successful verification
 */
async function sendWelcome(email, name, role) {
  return sendEmail({
    to: email,
    subject: `${name}, welcome to the Dinki Africa family!`,
    html: emailTemplates.welcome({ name, role }),
    text: `Hi ${name}, I'm Daniel Ishaku, founder of Dinki Africa. Welcome to the family! We built Dinki to celebrate African tailoring talent and make it easy for everyone to get clothes that truly fit. Login at https://dinki.africa to get started. — Daniel Ishaku, CEO, Dinki Africa`,
    from: '"Daniel Ishaku — Dinki Africa" <no-reply@dinki.africa>',
  });
}

/**
 * Send notification email (order updates, messages, etc.)
 */
async function sendNotification(email, { title, message, actionUrl, actionText }) {
  return sendEmail({
    to: email,
    subject: title,
    html: emailTemplates.notification({ title, message, actionUrl, actionText }),
    text: `${title}: ${message}`,
  });
}

/**
 * Send a support ticket email to the ops inbox with CC. Reply-To is set
 * to the ticket submitter's contact email so the recipient can reply
 * directly and the thread lands in the user's mailbox, not ours.
 */
async function sendSupportTicket({ to, cc, ticketRef, name, email, category, subject, message, submitter }) {
  const plainText = [
    `Support Ticket #${ticketRef}`,
    `Category: ${category}`,
    `Subject: ${subject}`,
    '',
    `From: ${name} <${email}>`,
    submitter ? `Submitted by: ${submitter.name} <${submitter.email}> (${submitter.role})` : '',
    '',
    message,
  ].filter(Boolean).join('\n');

  return sendEmail({
    to,
    cc,
    subject: `[Dinki Support] #${ticketRef} — ${subject}`,
    html: emailTemplates.supportTicket({ ticketRef, name, email, category, subject, message, submitter }),
    text: plainText,
    replyTo: email,
  });
}

/**
 * Send a system/broadcast notification email using the minimalist gold
 * template. Used by the admin broadcast path to mirror the in-app
 * notification into the user's inbox when the admin opts in.
 */
async function sendSystemNotification(email, { name, title, message, link }) {
  const plainText = [title, message, link].filter(Boolean).join('\n\n');
  return sendEmail({
    to: email,
    subject: title,
    html: emailTemplates.systemNotification({ name, title, message, link }),
    text: plainText,
  });
}

/**
 * Verify Postfix connection on startup
 */
async function verifyConnection() {
  if (RESEND_API_KEY) {
    console.log('[EMAIL] Transport: Resend HTTP API (RESEND_API_KEY detected).');
    return true;
  }
  try {
    await getTransporter().verify();
    console.log('[EMAIL] Postfix connection verified — ready to send');
    return true;
  } catch (err) {
    console.error('[EMAIL] Postfix connection failed:', err.message);
    console.error('[EMAIL] Set RESEND_API_KEY to send via Resend, or check Postfix: sudo systemctl status postfix');
    return false;
  }
}

module.exports = {
  sendEmail,
  sendOTP,
  sendVerificationEmail,
  sendPasswordReset,
  sendWelcome,
  sendNotification,
  sendSystemNotification,
  sendSupportTicket,
  verifyConnection,
};

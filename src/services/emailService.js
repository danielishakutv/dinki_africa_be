/**
 * Email Service — Sends transactional emails via local Postfix
 * Drop this into: backend/src/services/emailService.js
 */
const nodemailer = require('nodemailer');
const { emailTemplates } = require('./emailTemplates');

// Postfix transport — container reaches host Postfix via host.docker.internal
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'host.docker.internal',
  port: 25,
  secure: false,
  tls: { rejectUnauthorized: false },
  // Connection pooling for better performance
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
});

const FROM_ADDRESS = process.env.EMAIL_FROM || '"Dinki Africa" <no-reply@dinki.africa>';
const SUPPORT_ADDRESS = process.env.EMAIL_SUPPORT || 'support@dinki.africa';

/**
 * Send a raw email
 */
async function sendEmail({ to, subject, html, text, from }) {
  try {
    const info = await transporter.sendMail({
      from: from || FROM_ADDRESS,
      to,
      subject,
      html,
      text: text || subject, // plain-text fallback
    });
    console.log(`[EMAIL] Sent to ${to} — messageId: ${info.messageId}`);
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
 * Verify Postfix connection on startup
 */
async function verifyConnection() {
  try {
    await transporter.verify();
    console.log('[EMAIL] Postfix connection verified — ready to send');
    return true;
  } catch (err) {
    console.error('[EMAIL] Postfix connection failed:', err.message);
    console.error('[EMAIL] Emails will not be sent. Check Postfix is running: sudo systemctl status postfix');
    return false;
  }
}

module.exports = {
  sendEmail,
  sendOTP,
  sendPasswordReset,
  sendWelcome,
  sendNotification,
  verifyConnection,
};

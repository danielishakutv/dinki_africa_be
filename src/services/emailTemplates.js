/**
 * Email HTML Templates — Dinki Africa branded transactional emails
 * Drop this into: backend/src/services/emailTemplates.js
 */

const BRAND_COLOR = '#1E3A5F';    // Dinki dark blue (header bar on legacy templates)
const ACCENT_COLOR = '#F59E0B';   // Dinki amber/gold (legacy accent)
const BG_COLOR = '#F3F4F6';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://dinki.africa';

// Minimalist template palette — matches the web app's gold accent exactly.
const GOLD = '#D4AF37';
const INK = '#111827';
const MUTED = '#6B7280';
const DIVIDER = '#EAECEF';

/**
 * Base wrapper — every email uses this shell
 */
function baseLayout(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dinki Africa</title>
</head>
<body style="margin:0;padding:0;background:${BG_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BG_COLOR};padding:24px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:${BRAND_COLOR};padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:0.5px;">Dinki Africa</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background:${BG_COLOR};text-align:center;border-top:1px solid #E5E7EB;">
              <p style="margin:0;font-size:12px;color:#9CA3AF;">
                Dinki Africa &mdash; Connecting tailors and customers across Africa
              </p>
              <p style="margin:4px 0 0;font-size:12px;color:#9CA3AF;">
                <a href="${FRONTEND_URL}" style="color:${BRAND_COLOR};text-decoration:none;">dinki.africa</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * CTA button helper
 */
function button(text, url) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td align="center">
      <a href="${url}" style="display:inline-block;padding:14px 32px;background:${BRAND_COLOR};color:#ffffff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;">${text}</a>
    </td>
  </tr>
</table>`;
}

/**
 * Minimalist shell — a single white card on cloud-grey, no coloured header
 * bar, a thin gold accent line, clean typography. Designed to match the
 * aesthetic of the web app rather than the heavier transactional templates.
 */
function minimalLayout({ title, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F2F0EB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;color:${INK};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F0EB;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:32px 40px 8px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:11px;font-weight:700;letter-spacing:2px;color:${GOLD};text-transform:uppercase;">Dinki Africa</td>
                </tr>
              </table>
              <div style="height:2px;width:32px;background:${GOLD};margin:10px 0 24px;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 36px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid ${DIVIDER};">
              <p style="margin:0;color:${MUTED};font-size:12px;line-height:1.6;text-align:center;">
                You received this because you have notifications enabled on Dinki Africa.<br>
                <a href="${FRONTEND_URL}" style="color:${GOLD};text-decoration:none;font-weight:600;">dinki.africa</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function goldButton(text, url) {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0 4px;">
  <tr>
    <td>
      <a href="${url}" style="display:inline-block;padding:12px 26px;background:${GOLD};color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;letter-spacing:0.2px;">${text}</a>
    </td>
  </tr>
</table>`;
}

const emailTemplates = {
  /**
   * OTP verification email
   */
  otp({ otp, name }) {
    return baseLayout(`
      <h2 style="margin:0 0 8px;color:${BRAND_COLOR};font-size:20px;">Verify your email</h2>
      <p style="margin:0 0 24px;color:#4B5563;font-size:15px;line-height:1.6;">
        Hi ${name || 'there'}, use the code below to verify your Dinki Africa account.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center">
            <div style="display:inline-block;padding:16px 48px;background:${BG_COLOR};border:2px dashed ${ACCENT_COLOR};border-radius:8px;font-size:36px;font-weight:700;letter-spacing:8px;color:${BRAND_COLOR};">
              ${otp}
            </div>
          </td>
        </tr>
      </table>
      <p style="margin:24px 0 0;color:#6B7280;font-size:13px;line-height:1.5;">
        This code expires in <strong>10 minutes</strong>. If you didn't request this, please ignore this email.
      </p>
    `);
  },

  /**
   * Password reset email
   */
  passwordReset({ resetUrl, name }) {
    return baseLayout(`
      <h2 style="margin:0 0 8px;color:${BRAND_COLOR};font-size:20px;">Reset your password</h2>
      <p style="margin:0 0 8px;color:#4B5563;font-size:15px;line-height:1.6;">
        Hi ${name || 'there'}, we received a request to reset your Dinki Africa password.
      </p>
      <p style="margin:0 0 8px;color:#4B5563;font-size:15px;line-height:1.6;">
        Click the button below to choose a new password:
      </p>
      ${button('Reset Password', resetUrl)}
      <p style="margin:0;color:#6B7280;font-size:13px;line-height:1.5;">
        This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.
      </p>
    `);
  },

  /**
   * Welcome email after verification — personal note from CEO
   */
  welcome({ name, role }) {
    const tailorBenefits = `
      <li style="margin:0 0 6px;color:#4B5563;font-size:15px;line-height:1.5;">Your own <strong>digital storefront</strong> to showcase your craft to thousands</li>
      <li style="margin:0 0 6px;color:#4B5563;font-size:15px;line-height:1.5;">Direct orders from customers who value quality tailoring</li>
      <li style="margin:0 0 6px;color:#4B5563;font-size:15px;line-height:1.5;">Tools to manage jobs, measurements, and customers — all in one place</li>
    `;
    const customerBenefits = `
      <li style="margin:0 0 6px;color:#4B5563;font-size:15px;line-height:1.5;">Access to <strong>skilled, verified tailors</strong> across Africa</li>
      <li style="margin:0 0 6px;color:#4B5563;font-size:15px;line-height:1.5;">Your measurements saved securely — order from anywhere, anytime</li>
      <li style="margin:0 0 6px;color:#4B5563;font-size:15px;line-height:1.5;">Browse styles, fabrics, and get clothes made <strong>just for you</strong></li>
    `;

    return baseLayout(`
      <h2 style="margin:0 0 16px;color:${BRAND_COLOR};font-size:22px;font-weight:700;">Welcome to the Family, ${name}!</h2>
      <p style="margin:0 0 14px;color:#4B5563;font-size:15px;line-height:1.7;">
        I'm Daniel, and I built Dinki Africa with one dream — to celebrate the incredible talent of African tailors and make it effortless for people to get clothes that truly fit.
      </p>
      <p style="margin:0 0 14px;color:#4B5563;font-size:15px;line-height:1.7;">
        By joining us today, you're now part of a movement that's changing how Africa experiences fashion. Every stitch tells a story, and yours starts right here.
      </p>
      <p style="margin:0 0 8px;color:${BRAND_COLOR};font-size:15px;font-weight:600;">Here's what's waiting for you:</p>
      <ul style="margin:0 0 20px;padding-left:20px;">
        ${role === 'tailor' ? tailorBenefits : customerBenefits}
      </ul>
      <p style="margin:0 0 24px;color:#4B5563;font-size:15px;line-height:1.7;">
        We're just getting started, and having you here means the world to us. Follow us <strong>@dinki.africa</strong> on social media for updates, style inspiration, and behind-the-scenes stories from our amazing tailors.
      </p>
      ${button('Login to Your Account', `${FRONTEND_URL}`)}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;border-top:1px solid #E5E7EB;padding-top:20px;">
        <tr>
          <td>
            <p style="margin:0 0 2px;color:${BRAND_COLOR};font-size:15px;font-weight:700;">Daniel Ishaku</p>
            <p style="margin:0 0 2px;color:#6B7280;font-size:13px;">Founder & CEO, Dinki Africa</p>
            <p style="margin:0;color:${ACCENT_COLOR};font-size:13px;font-style:italic;">"Every stitch tells a story."</p>
          </td>
        </tr>
      </table>
    `);
  },

  /**
   * Support ticket email — dispatched to ops when a user files a ticket.
   * Minimalist gold theme, ticket ref up top, message body rendered
   * with white-space preserved, Reply button wired to mailto: so ops
   * can respond without leaving their inbox.
   */
  supportTicket({ ticketRef, name, email, category, subject, message, submitter }) {
    const submitterLine = submitter && submitter.email && submitter.email !== email
      ? `<p style="margin:6px 0 0;color:${MUTED};font-size:12px;">
           Logged in as <strong style="color:${INK};">${escapeHtml(submitter.name || '—')}</strong>
           &lt;${escapeHtml(submitter.email)}&gt; · ${escapeHtml(submitter.role || 'user')}
         </p>`
      : submitter?.role
        ? `<p style="margin:6px 0 0;color:${MUTED};font-size:12px;">Role: ${escapeHtml(submitter.role)}</p>`
        : '';

    const replyUrl = `mailto:${email}?subject=${encodeURIComponent(`Re: ${subject} (#${ticketRef})`)}`;
    const firstName = (name || 'them').split(' ')[0];

    const body = `
      <p style="margin:0 0 4px;color:${GOLD};font-size:11px;letter-spacing:2px;font-weight:700;text-transform:uppercase;">
        Ticket #${escapeHtml(ticketRef)}
      </p>
      <h1 style="margin:0 0 8px;color:${INK};font-size:22px;font-weight:700;line-height:1.35;letter-spacing:-0.2px;">
        ${escapeHtml(subject)}
      </h1>
      <p style="margin:0 0 24px;color:${MUTED};font-size:13px;">
        Category: <strong style="color:${INK};">${escapeHtml(category)}</strong>
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid ${DIVIDER};border-radius:10px;">
        <tr>
          <td style="padding:14px 18px;">
            <p style="margin:0 0 2px;color:${MUTED};font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">From</p>
            <p style="margin:0;color:${INK};font-size:15px;font-weight:600;">${escapeHtml(name)}</p>
            <p style="margin:2px 0 0;font-size:13px;">
              <a href="mailto:${escapeHtml(email)}" style="color:${GOLD};text-decoration:none;font-weight:500;">${escapeHtml(email)}</a>
            </p>
            ${submitterLine}
          </td>
        </tr>
      </table>

      <p style="margin:0 0 8px;color:${MUTED};font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Message</p>
      <div style="padding:16px 18px;background:#FAFAF7;border-radius:10px;color:#374151;font-size:14px;line-height:1.7;white-space:pre-line;">${escapeHtml(message)}</div>

      ${goldButton(`Reply to ${firstName}`, replyUrl)}

      <p style="margin:20px 0 0;color:${MUTED};font-size:11px;line-height:1.5;">
        Hit reply on this email to respond directly — it goes to the user.
        Keep the ticket ref <strong>#${escapeHtml(ticketRef)}</strong> in the subject line to keep threads tidy.
      </p>
    `;
    return minimalLayout({ title: `Support #${ticketRef}: ${subject}`, body });
  },

  /**
   * System notification email — minimalist, gold-accented, matches web app.
   * Used for admin broadcasts and anywhere we want to mirror an in-app
   * notification into the user's inbox.
   */
  systemNotification({ name, title, message, link }) {
    const greeting = name
      ? `<p style="margin:0 0 8px;color:${MUTED};font-size:14px;line-height:1.5;">Hi ${escapeHtml(name)},</p>`
      : '';
    const body = `
      ${greeting}
      <h1 style="margin:0 0 16px;color:${INK};font-size:22px;font-weight:700;line-height:1.35;letter-spacing:-0.2px;">${escapeHtml(title)}</h1>
      ${message ? `<p style="margin:0;color:#374151;font-size:15px;line-height:1.7;white-space:pre-line;">${escapeHtml(message)}</p>` : ''}
      ${link ? goldButton('Open in Dinki', link.startsWith('http') ? link : `${FRONTEND_URL}${link}`) : ''}
    `;
    return minimalLayout({ title, body });
  },

  /**
   * Generic notification email (order updates, new messages, etc.)
   */
  notification({ title, message, actionUrl, actionText }) {
    return baseLayout(`
      <h2 style="margin:0 0 8px;color:${BRAND_COLOR};font-size:20px;">${title}</h2>
      <p style="margin:0 0 8px;color:#4B5563;font-size:15px;line-height:1.6;">
        ${message}
      </p>
      ${actionUrl ? button(actionText || 'View Details', actionUrl) : ''}
      <p style="margin:0;color:#6B7280;font-size:13px;line-height:1.5;">
        You received this because you have notifications enabled on Dinki Africa.
      </p>
    `);
  },
};

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { emailTemplates };

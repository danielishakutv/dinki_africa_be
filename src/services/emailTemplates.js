/**
 * Email HTML Templates — Dinki Africa branded transactional emails
 * Drop this into: backend/src/services/emailTemplates.js
 */

const BRAND_COLOR = '#1E3A5F';    // Dinki dark blue
const ACCENT_COLOR = '#F59E0B';   // Dinki amber/gold
const BG_COLOR = '#F3F4F6';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://dinki.africa';

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

module.exports = { emailTemplates };

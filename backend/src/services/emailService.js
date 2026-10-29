const nodemailer = require("nodemailer");
const env = require("../config/env");

/**
 * Email delivery on a free transactional tier.
 *
 * Design rule that matters most: EMAIL IS NEVER LOAD-BEARING. Every notification
 * is written to the in-app inbox FIRST, and sending is best-effort on top. If
 * the provider is unconfigured, rate-limited, or down, the product still works —
 * the user just doesn't also get an email. A quota failure must never fail the
 * action that triggered it.
 *
 * The daily cap is enforced locally so the free tier is not blown through by a
 * bulk action: without it, one "notify the whole cohort" would consume the
 * month's allowance in a single click.
 */

const DAILY_CAP = Number(process.env.EMAIL_DAILY_CAP || env.emailDailyCap || 300);

// In-memory counter. Resets when the process restarts — deliberately simple,
// because the consequence of an over-count is only "we sent slightly more than
// the cap", and a durable counter would need a DB write per email.
let sendState = { day: new Date().toISOString().slice(0, 10), count: 0 };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function rolloverIfNeeded() {
  const d = today();
  if (sendState.day !== d) {
    sendState = { day: d, count: 0 };
  }
}

function emailConfigured() {
  return Boolean(env.emailProvider && env.emailApiKey && env.emailFrom);
}

let transporter = null;
function getTransporter() {
  if (transporter || !emailConfigured()) return transporter;

  // Sender addresses vary by provider but all speak SMTP, so one config path.
  const HOSTS = {
    brevo: "smtp-relay.brevo.com",
    resend: "smtp.resend.com",
    "gmail-smtp": "smtp.gmail.com",
    smtp: env.emailHost,
  };

  const host = HOSTS[env.emailProvider] || env.emailHost;
  if (!host) return null;

  transporter = nodemailer.createTransport({
    host,
    port: Number(env.emailPort || 587),
    secure: Number(env.emailPort || 587) === 465,
    auth: {
      user: env.emailUser || env.emailApiKey,
      pass: env.emailApiKey,
    },
  });

  return transporter;
}

function emailStatus() {
  rolloverIfNeeded();
  return {
    configured: emailConfigured(),
    provider: env.emailProvider || null,
    from: env.emailFrom || null,
    sentToday: sendState.count,
    dailyCap: DAILY_CAP,
    remaining: Math.max(0, DAILY_CAP - sendState.count),
  };
}

/**
 * Send one email. Never throws: returns { sent, reason } so a caller can record
 * the outcome on the Notification without a try/catch around every call site.
 */
async function sendMail({ to, subject, text, html, attachments }) {
  rolloverIfNeeded();

  if (!emailConfigured()) {
    return { sent: false, reason: "not_configured" };
  }

  if (sendState.count >= DAILY_CAP) {
    console.warn(`[email] daily cap of ${DAILY_CAP} reached — skipping send to ${to}`);
    return { sent: false, reason: "daily_cap_reached" };
  }

  const tx = getTransporter();
  if (!tx) return { sent: false, reason: "transport_unavailable" };

  try {
    await tx.sendMail({
      from: env.emailFrom,
      to,
      subject,
      text,
      html: html || undefined,
      attachments: attachments || undefined,
    });
    sendState.count += 1;
    return { sent: true };
  } catch (err) {
    // One retry on a transient failure, then give up quietly. The in-app
    // notification is already stored, so nothing is lost from the user's view.
    console.warn(`[email] send failed (${err.message}) — retrying once`);
    try {
      await tx.sendMail({
        from: env.emailFrom,
        to,
        subject,
        text,
        html: html || undefined,
        attachments: attachments || undefined,
      });
      sendState.count += 1;
      return { sent: true, retried: true };
    } catch (err2) {
      console.error(`[email] send failed twice: ${err2.message}`);
      return { sent: false, reason: err2.message };
    }
  }
}

/** Minimal branded wrapper — plain enough to survive every mail client. */
function wrapHtml(title, body, ctaUrl, ctaLabel) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:28px 24px;color:#0f1115">
    <div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#5b7c6a;font-weight:600;margin-bottom:18px">JobSync</div>
    <h1 style="font-size:19px;margin:0 0 12px;line-height:1.35">${title}</h1>
    <div style="font-size:14px;line-height:1.6;color:#3d434d">${body}</div>
    ${ctaUrl
      ? `<p style="margin:24px 0 0"><a href="${ctaUrl}" style="display:inline-block;background:#2f4a3a;color:#fff;text-decoration:none;padding:11px 20px;border-radius:999px;font-size:14px;font-weight:600">${ctaLabel || "Open JobSync"}</a></p>`
      : ""
    }
    <p style="font-size:12px;color:#8a9099;margin-top:26px;line-height:1.6">
      You're receiving this because you have a JobSync account. In-app notifications always work,
      even when email does not.
    </p>
  </div>`;
}

module.exports = { sendMail, emailStatus, emailConfigured, wrapHtml };

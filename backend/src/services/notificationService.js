const Notification = require("../models/Notification");
const User = require("../shared/auth/User");
const { sendMail, emailConfigured, wrapHtml } = require("./emailService");
const env = require("../config/env");

/**
 * notify — the one entry point for telling somebody something happened.
 *
 * Always writes the in-app Notification first. Email is attempted afterwards and
 * its outcome recorded on the document, so a mail failure is visible without
 * ever failing the action that triggered it.
 *
 * @param {Object} opts
 * @param {String} [opts.toUserId]      one recipient
 * @param {ObjectId} [opts.toCollegeId] institutional channel
 * @param {String} [opts.toRole]        role within that channel
 * @param {String} opts.type
 * @param {String} opts.title
 * @param {String} [opts.body]
 * @param {Object} [opts.meta]
 * @param {Object} [opts.from]          { _id, name } of the actor
 * @param {String} [opts.emailTo]       explicit address; otherwise the user's
 * @param {String} [opts.ctaUrl]        link for the email button
 * @param {String} [opts.ctaLabel]
 * @param {Array}  [opts.attachments]
 */
async function notify(opts) {
  const {
    toUserId = null,
    toCollegeId = null,
    toRole = null,
    type,
    title,
    body = "",
    meta = {},
    from = null,
    emailTo = null,
    ctaUrl = null,
    ctaLabel = null,
    attachments = null,
  } = opts;

  // An institution-addressed notification has no single recipient, so email is
  // only possible when an explicit address is supplied.
  let address = emailTo;
  if (!address && toUserId) {
    const user = await User.findById(toUserId).select("email").lean();
    address = user?.email || null;
  }

  const doc = await Notification.create({
    toUserId,
    toCollegeId,
    toRole,
    type,
    title,
    body,
    meta,
    fromUserId: from?._id || null,
    fromName: from?.name || "",
  });

  if (address && emailConfigured()) {
    const result = await sendMail({
      to: address,
      subject: title,
      text: body || title,
      html: wrapHtml(
        title,
        (body || "").replace(/\n/g, "<br/>"),
        ctaUrl ? `${env.clientUrl}${ctaUrl}` : env.clientUrl,
        ctaLabel
      ),
      attachments,
    });
    doc.emailSent = Boolean(result.sent);
    doc.emailError = result.sent ? "" : result.reason || "unknown";
    await doc.save();
  } else if (address) {
    doc.emailError = "not_configured";
    await doc.save();
  }

  return doc;
}

/**
 * notifyMany — for bulk actions. Sequential rather than parallel so a 40-student
 * action does not open 40 simultaneous SMTP connections; the bulk route already
 * runs inside the shared queue.
 */
async function notifyMany(list) {
  const out = [];
  for (const item of list) {
    try {
      out.push(await notify(item));
    } catch (err) {
      console.error("[notify] failed:", err.message);
    }
  }
  return out;
}

module.exports = { notify, notifyMany };

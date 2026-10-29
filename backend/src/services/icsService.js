const ics = require("ics");

/**
 * .ics generation — a calendar invite with no calendar API.
 *
 * Why a file instead of an integration: Google/Microsoft Calendar APIs need
 * OAuth, a consent screen, verified redirect URIs, and token refresh kept alive
 * forever. An .ics attachment is understood by every mail client, needs no
 * credentials, and costs nothing (scope §9, §15).
 */

/** RFC 5545 wants UTC timestamps in this exact shape. */
function toIcsDate(date) {
  return new Date(date).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function clean(text, max = 200) {
  return String(text || "")
    .replace(/[\r\n]+/g, " ")
    .slice(0, max)
    .trim();
}

/**
 * Build the invite.
 *
 * `uid` is passed in and stored on the Meeting, so a reschedule updates the one
 * event in the recipient's calendar instead of creating a second.
 *
 * Returns null when the payload is not valid enough to produce a trustworthy
 * file — a malformed invite that silently fails to import is worse than none.
 */
function buildInterviewIcs({
  uid,
  title,
  description,
  location,
  start,
  end,
  organiserName,
  organiserEmail,
  attendeeName,
  attendeeEmail,
}) {
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  if (endDate <= startDate) return null;

  const event = {
    title: clean(title, 160) || "Interview",
    description: clean(description, 900),
    location: clean(location, 200) || "Online",
    start: [
      startDate.getUTCFullYear(),
      startDate.getUTCMonth() + 1,
      startDate.getUTCDate(),
      startDate.getUTCHours(),
      startDate.getUTCMinutes(),
    ],
    end: [
      endDate.getUTCFullYear(),
      endDate.getUTCMonth() + 1,
      endDate.getUTCDate(),
      endDate.getUTCHours(),
      endDate.getUTCMinutes(),
    ],
    startInputType: "utc",
    endInputType: "utc",
    // Outsiders read these fields, so a blank value must be omitted entirely
    // rather than serialised as an empty string.
    organizer: organiserEmail
      ? { name: clean(organiserName, 80) || "JobSync", email: organiserEmail }
      : undefined,
    attendees: attendeeEmail
      ? [
        {
          name: clean(attendeeName, 80) || attendeeEmail,
          email: attendeeEmail,
          rsvp: true,
        },
      ]
      : undefined,
    uid,
    productId: "JobSync/JobSync",
    status: "CONFIRMED",
    busyStatus: "BUSY",
    alarms: [
      { action: "display", description: "Interview reminder", trigger: { hours: 1, before: true } },
      { action: "display", description: "Interview in 15 minutes", trigger: { minutes: 15, before: true } },
    ],
  };

  const { error, value } = ics.createEvent(event);
  if (error) {
    console.error("[ics] generation failed:", error.message || error);
    return null;
  }
  return value;
}

module.exports = { buildInterviewIcs, toIcsDate };

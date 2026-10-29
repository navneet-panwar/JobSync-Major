const PQueue = require("p-queue").default;

/**
 * A single in-process job queue for bulk operations.
 *
 * WHY: a placement cell bulk-passing 40 students must not fire 40 concurrent
 * database writes and (later) 40 outbound notifications. On a free-tier
 * deployment that is how you get rate-limited by your own infrastructure.
 * Concurrency 2 keeps the load flat and the response still returns in a
 * predictable time.
 *
 * Deliberately a plain in-process queue rather than BullMQ + Redis: this app
 * runs as ONE Render free instance, so a broker would add a second sleeping
 * service to wake up for no benefit (scope §9).
 *
 * Not durable across restarts — acceptable because every bulk action is
 * re-runnable by the user, and the per-item outcome is reported back to them.
 */
const bulkQueue = new PQueue({ concurrency: 2 });

/** Queue depth — surfaced on /api/health so a slow bulk job is observable. */
function queueStats() {
  return {
    pending: bulkQueue.pending,
    size: bulkQueue.size,
  };
}

module.exports = { bulkQueue, queueStats };

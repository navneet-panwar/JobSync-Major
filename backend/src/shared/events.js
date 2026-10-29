const { EventEmitter } = require("events");

// The JobSync internal event bus — the hook the Full System Loop (Phase 11)
// listens on. Plain EventEmitter, no broker, no external service: free-tier
// discipline. Every module emits domain events at the tail of its handlers;
// listeners are fire-and-forget and must never fail the original request.
//
// Canonical event names (add new ones here, nowhere else):
//   resume.analyzed        { userId, resumeId, versionId, analysisId, atsScore }
//   resume.rewriteApplied  { userId, resumeId, versionId, appliedCount }
//   roadmap.itemCompleted  { userId, jdId, itemId, skill }          (Phase 5)
//   readiness.recomputeRequested { userId, jdId, resumeVersionId }  (Phase 11)

class JobSyncEvents extends EventEmitter {
  emitSafe(name, payload = {}) {
    try {
      this.emit(name, payload);
    } catch (err) {
      // A listener throwing must never crash the request that emitted.
      console.error(`[events] listener error for "${name}":`, err.message);
    }
  }
}

// Raise the default listener cap — many modules will attach listeners in one
// process, and 10 is Node's default warning threshold.
const events = new JobSyncEvents();
events.setMaxListeners(50);

module.exports = events;

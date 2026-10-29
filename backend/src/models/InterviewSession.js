const mongoose = require("mongoose");

const pasteEventSchema = new mongoose.Schema(
  { at: { type: Date }, chars: { type: Number } },
  { _id: false }
);

const answerSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    text: { type: String, default: "" },

    // Telemetry captured by the client while the answer was typed.
    timeToFirstKeystrokeMs: { type: Number, default: null },
    totalMs: { type: Number, default: null },
    pasteEvents: { type: [pasteEventSchema], default: [] },
    blurCount: { type: Number, default: 0 },

    feedback: {
      score: { type: Number, default: null },
      strengths: { type: [String], default: [] },
      improvements: { type: [String], default: [] },
      modelAnswer: { type: String, default: "" },
    },

    answeredAt: { type: Date, default: null },
  },
  { _id: false }
);

const integrityFlagSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "tab_blur",
        "fullscreen_exit",
        "large_paste",
        "fast_long_answer",
        "duplicate_session",
        "similar_to_peer",
      ],
      required: true,
    },
    at: { type: Date, default: Date.now },
    detail: { type: String, default: "", maxlength: 400 },
  },
  { _id: false }
);

/**
 * InterviewSession — a text-only mock interview with integrity signals.
 *
 * THE GOVERNING RULE (scope §8.1): flags are INFORMATIONAL. Nothing in this
 * document ever modifies a score and nothing auto-fails a candidate. Automated
 * proctoring has a well-documented false-positive problem — a slow typist, a
 * screen-reader user, a shared family computer — and wrongly accusing a student
 * is a worse outcome than missing a cheater. A human at the placement cell makes
 * the final call.
 */
const interviewSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    collegeId: { type: mongoose.Schema.Types.ObjectId, ref: "College", default: null, index: true },
    jdId: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription", default: null },
    targetRole: { type: String, default: "", maxlength: 160 },

    // Which resume version the questions were tailored to. Stored so a placement
    // cell reviewing the transcript knows exactly what the student claimed at
    // the time — and so a re-run can be reproduced against the same version.
    resumeVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ResumeVersion",
      default: null,
    },

    status: {
      type: String,
      enum: ["active", "completed", "abandoned"],
      default: "active",
      index: true,
    },

    // 5 asked from a generated pool of 8, shuffled per session.
    questions: {
      type: [
        {
          id: String,
          text: String,
          focus: { type: String, default: "" },
          askedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    answers: { type: [answerSchema], default: [] },

    integrityFlags: { type: [integrityFlagSchema], default: [] },

    // Single-session lock: starting a new session invalidates any other active
    // one, so an interview cannot be answered from two devices at once.
    sessionToken: { type: String, default: "", index: true },
    invalidatedByNewerSession: { type: Boolean, default: false },
    invalidatedAt: { type: Date, default: null },

    integrityAcknowledgedAt: { type: Date, default: null },

    overallSummary: { type: String, default: "" },
    model: { type: String, default: "" },
    promptTokens: { type: Number, default: 0 },
    responseTokens: { type: Number, default: 0 },

    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

interviewSessionSchema.index({ userId: 1, status: 1, createdAt: -1 });
// Placement-cell read path: recent sessions within a college.
interviewSessionSchema.index({ collegeId: 1, createdAt: -1 });

interviewSessionSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("InterviewSession", interviewSessionSchema);

const mongoose = require("mongoose");

/**
 * SkillAlias — canonical skill vocabulary.
 *
 * Every skill string that enters JobSync (resume parse, JD parse, match engine)
 * is normalised through this collection so "ReactJS", "React.js" and "React"
 * become ONE entry. Without it, the placement cell's skill-gap aggregation and
 * the recruiter's ranking fragment on spelling variants: three students who all
 * know React would look like three different skills.
 *
 * MongoDB-backed (rather than a hardcoded object) so an admin can extend it
 * without a deploy — scope §11.4's "shared skill taxonomy".
 */
const skillAliasSchema = new mongoose.Schema(
  {
    // The normalised, canonical name — e.g. "react", "node.js", "postgresql".
    canonical: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    // Variants / accepted spellings that map to `canonical`.
    aliases: {
      type: [String],
      default: [],
      index: true,
    },
    // Display label — the pretty form shown in the UI ("Node.js", "PostgreSQL").
    label: { type: String, trim: true },
    category: {
      type: String,
      enum: ["language", "framework", "database", "cloud", "tool", "concept", "soft", "other"],
      default: "other",
    },
  },
  { timestamps: true }
);

// Look-ups are always "does this alias exist", so keep the array searchable.
skillAliasSchema.index({ aliases: 1 });

module.exports = mongoose.model("SkillAlias", skillAliasSchema);

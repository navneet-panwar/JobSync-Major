const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// The canonical JobSync User model. Shared by every module.
// Phase 2 adds: role (student|recruiter|placement_cell|admin), collegeId
// (stamped permanently at signup for students/placement cells, null for
// recruiters/admins), and consent (used in Phase 12).
const ROLES = ["student", "recruiter", "placement_cell", "admin"];

const userSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Email is invalid"],
            index: true,
        },
        passwordHash: { type: String, required: true, select: false },
        name: { type: String, required: true, trim: true, maxlength: 80 },

        // --- JobSync platform fields (Phase 2) ---
        role: {
            type: String,
            enum: ROLES,
            default: "student",
            index: true,
        },
        // Required + permanent for student & placement_cell; null for recruiter/admin.
        collegeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "College",
            default: null,
            index: true,
        },
        // Phase 12 will consume this; default true keeps current behaviour.
        consent: {
            shownToRecruiters: { type: Boolean, default: true },
            at: { type: Date, default: null },
        },

    },
    { timestamps: true }
);
userSchema.statics.hashPassword = function (plain) {
    return bcrypt.hash(plain, 12);
};

userSchema.methods.comparePassword = function (plain) {
    return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.passwordHash;
    delete obj.__v;
    return obj;
};

module.exports = mongoose.model("User", userSchema);

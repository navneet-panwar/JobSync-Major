const express = require("express");
const { z } = require("zod");

const env = require("../config/env");
const asyncHandler = require("../utils/asyncHandler");

const ApiError = require("../utils/ApiError");
const { signToken, cookieOptions } = require("../utils/jwt");   
const {requireAuth} = require("../middleware/auth");
const User = require("../models/User");
const College = require("../shared/auth/College");
const { authLimiter, registerLimiter } = require("../middleware/rateLimit");
const { validate } = require("../middleware/validate");
const events = require("../shared/events");

const router = express.Router();

const ROLES = ["student", "recruiter", "placement_cell"];

// College codes must not be brute-forceable: register attempts per IP are
// separately limited (registerLimiter) on top of the general auth limiter.
const registerSchema = z.object({
    name : z.string().trim().min(1).max(80),
    email : z.string().trim().toLowerCase().email(),
    password : z.string().min(8).max(128),
    role : z.enum(ROLES).default("student"),
    collegeCode : z.string().trim().toUpperCase().optional(),
    collegeName : z.string().trim().min(3).max(120).optional(),
    // Phase 12 consumes this; accepted now so the UI ships with the toggle.
    consentToRecruiters : z.boolean().optional(),

});

const loginSchema = z.object({
    email : z.string().trim().toLowerCase().email(),
    password : z.string().min(8).max(128),
});

const passwordSchema = z.object({
    currentPassword : z.string().min(1).max(128),
    newPassword : z.string().min(8).max(128),

});

function issueSession(res,user){
    const token = signToken({sub : user._id.toString()});
    res.cookie(env.cookieName,token,cookieOptions);
}
router.post(
    "/register",
    authLimiter,
    registerLimiter,
    validate(registerSchema),
    asyncHandler(async (req,res) => {
        const {name,email,password,role,collegeCode,collegeName,consentToRecruiters} = req.body;

        const existing = await User.findOne({email});
        if(existing) throw ApiError.conflict("Email already registered");

        // College resolution:
        //   - student      → MUST join an existing college via its code (the
        //                    placement cell of that college issues the code).
        //   - placement_cell → registers WITHOUT a code and creates its own
        //                    college here (college name required, unique).
        //                    The new code is returned in the response and is
        //                    always visible in the cell's dashboard/settings.
        //   - recruiter    → institution-independent, no college.
        let collegeId = null;
        let createdCollege = null;
        if (role === "student") {
            if (!collegeCode) {
                throw ApiError.badRequest(
                    "A college code is required — ask your placement cell for it."
                );
            }
            const college = await College.findOne({ code: collegeCode, isActive: true });
            if (!college) throw ApiError.badRequest("Invalid or inactive college code");
            collegeId = college._id;
        } else if (role === "placement_cell") {
            if (!collegeName) {
                throw ApiError.badRequest(
                    "Enter your college's name — a registration code will be generated for your students."
                );
            }

            // Match case-insensitively and ignoring punctuation, so "GNIOT",
            // "GNIOT " and "gn iot" cannot each become a separate institution.
            // An exact-match check let near-duplicate colleges coexist, which
            // splits a college's students across two records and silently breaks
            // gatekeeping (a pass is scoped to exactly one collegeId).
            const normalised = collegeName.trim().replace(/\s+/g, " ");
            const escaped = normalised.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const existingCollege = await College.findOne({
                name: { $regex: `^${escaped}$`, $options: "i" },
            });
            if (existingCollege) {
                throw ApiError.conflict(
                    `"${existingCollege.name}" is already on JobSync — ask its placement cell for the code, or use a distinct name.`
                );
            }

            createdCollege = await College.create({
                name: normalised,
                code: College.generateCode(normalised),
                isActive: true,
            });
            collegeId = createdCollege._id;
        }

        // Attach the cell to the college. The user is created below; if that
        // fails we delete this college so the name is not permanently reserved
        // by an account that was never created.

        const passwordHash = await User.hashPassword(password);

        // Create the user FIRST. A college is then only ever created by a user
        // who already exists — previously the college was created before the
        // user, so any later failure (duplicate email race, a crash, a dropped
        // request) left an orphan college that permanently reserved the name
        // and could never be claimed again.
        let user;
        try {
            user = await User.create({
                name,
                email,
                passwordHash,
                role,
                collegeId,
                consent: {
                    shownToRecruiters: consentToRecruiters !== false,
                    at: consentToRecruiters !== false ? new Date() : null,
                },
            });
        } catch (err) {
            // Clean up the college we just created if the user could not be
            // saved — otherwise the name stays reserved by a phantom account.
            if (createdCollege) await College.findByIdAndDelete(createdCollege._id).catch(() => {});
            throw err;
        }

        issueSession(res,user);
        events.emitSafe("auth.registered", { userId: user._id.toString(), role, collegeId: collegeId?.toString() });
        res.status(201).json({
            user,
            // Placement cells get their freshly generated code right away so
            // they can share it with students immediately.
            college: createdCollege
                ? { _id: createdCollege._id, name: createdCollege.name, code: createdCollege.code }
                : undefined,
        });
    })
);

router.post(
    "/login",
    authLimiter,
    validate(loginSchema),
    asyncHandler(async (req,res) => {
        const {email,password} = req.body;

        const user = await User.findOne({email}).select("+passwordHash");
        if(!user) throw ApiError.unauthorized("Invalid email or password");

        const ok = await user.comparePassword(password);
        if(!ok) throw ApiError.unauthorized("Invalid email or password");

        issueSession(res,user);
        res.json({user});
    })
);

const profileSchema = z.object({
    name: z.string().trim().min(1).max(80),
});

/**
 * PATCH /api/auth/consent
 *
 * Consent withdrawal is immediate and independent of placement status: the
 * moment a student says no, they stop appearing in every recruiter-facing query
 * (the feeds filter on `consent.shownToRecruiters !== false`). A placement cell
 * cannot override this — that is the point of a consent flag rather than a
 * status field (scope §12.4).
 */
router.patch(
    "/consent",
    requireAuth,
    validate(z.object({ shownToRecruiters: z.boolean() })),
    asyncHandler(async (req, res) => {
        const user = await User.findById(req.user._id);
        if (!user) throw ApiError.unauthorized("Session no longer valid");

        const granted = req.body.shownToRecruiters;
        user.consent = {
            shownToRecruiters: granted,
            at: granted ? new Date() : user.consent?.at || null,
        };
        await user.save();

        events.emitSafe("student.consentChanged", {
            userId: user._id.toString(),
            shownToRecruiters: granted,
        });

        res.json({ user });
    })
);

// Email change requires the current password: an email address is a login
// credential and a password-reset destination, so a hijacked open session must
// not be able to silently move the account to an attacker's inbox.
const emailSchema = z.object({
    newEmail : z.string().trim().toLowerCase().email(),
    currentPassword : z.string().min(1).max(128),
});

router.patch(
    "/email",
    authLimiter,
    requireAuth,
    validate(emailSchema),
    asyncHandler(async (req, res) => {
        const { newEmail, currentPassword } = req.body;

        const user = await User.findById(req.user._id).select("+passwordHash");
        if (!user) throw ApiError.unauthorized("Session no longer valid");

        const ok = await user.comparePassword(currentPassword);
        if (!ok) throw ApiError.unauthorized("Current password is incorrect");

        if (newEmail === user.email) {
            throw ApiError.badRequest("That's already your email address");
        }

        const taken = await User.findOne({ email: newEmail, _id: { $ne: user._id } });
        if (taken) throw ApiError.conflict("That email is already registered");

        user.email = newEmail;
        await user.save();

        events.emitSafe("auth.emailChanged", { userId: user._id.toString() });
        res.json({ user });
    })
);

router.patch(
    "/profile",
    requireAuth,
    validate(profileSchema),
    asyncHandler(async (req, res) => {
        const user = await User.findById(req.user._id);
        if (!user) throw ApiError.unauthorized("User not found");

        user.name = req.body.name;
        await user.save();
        res.json({ user });
    })
);

router.post("/logout",(req,res) => {
    res.clearCookie(env.cookieName,{ ...cookieOptions,maxAge : 0});
    res.json({ok : true});
});
router.get(
    "/me",
    requireAuth,
    asyncHandler(async (req,res) => {
        // Attach the college name so the UI can render "GNIOT Greater Noida"
        // without a second request.
        const user = req.user.toJSON();
        if (user.collegeId) {
            const College = require("../shared/auth/College");
            const college = await College.findById(user.collegeId).select("name").lean();
            user.college = college ? { _id: college._id, name: college.name } : null;
        } else {
            user.college = null;
        }
        res.json({user});
    })
);

router.patch(
    "/password",
    authLimiter,
    requireAuth,
    validate(passwordSchema),
    asyncHandler(async (req,res) => {
        const user = await User.findById(req.user._id).select("+passwordHash");
        if(!user) throw ApiError.unauthorized("Session no longer valid");

        const ok = await user.comparePassword(req.body.currentPassword);
        if(!ok) throw ApiError.unauthorized("Current password is incorrect");

        user.passwordHash = await User.hashPassword(req.body.newPassword);
        await user.save();
        res.json({ok : true});
    })
);
module.exports = router;
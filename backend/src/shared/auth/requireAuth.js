const env = require("../../config/env");
const ApiError = require("../../utils/ApiError");
const { verifyToken } = require("./jwt");
const User = require("./User");

// The one requireAuth for the whole platform, plus the role gate.
// College scoping lives in shared/collegeScope.js.
async function auth(req, res, next) {
    try {
        const token = req.cookies?.[env.cookieName];
        if (!token) throw ApiError.unauthorized();

        const payload = verifyToken(token);
        const user = await User.findById(payload.sub);
        if (!user) throw ApiError.unauthorized("Session no longer valid");

        req.user = user;
        next();
    } catch (err) {
        if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
            return next(ApiError.unauthorized("Session no longer valid"));
        }
        next(err);
    }
}

// Role gate — used after requireAuth: requireRole("placement_cell"),
// requireRole("recruiter", "admin"), etc. 403, never 401 — an authenticated
// user hitting a wrong-role route is a permission error, not a session error.
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) return next(ApiError.unauthorized());
        if (!roles.includes(req.user.role)) {
            return next(
                ApiError.forbidden(`This action requires one of: ${roles.join(", ")}`)
            );
        }
        next();
    };
}

module.exports = { requireAuth: auth, requireRole };

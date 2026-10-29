const {rateLimit,ipKeyGenerator} = require('express-rate-limit');

// Loaded for the NODE_ENV check in analyzeLimiter below.
const env = require("../config/env");

// Per-user limiter for AI-backed routes.
//
// IMPORTANT: this must be mounted AFTER requireAuth so `req.user` exists. It
// previously fell back to IP whenever `req.user` was missing, which silently
// turned a 5/minute-per-user budget into a 5/minute budget shared by everyone
// behind one IP — a campus NAT would have throttled the whole college.
//
// We now assert instead: a missing user is a wiring bug and must surface in
// development rather than degrade quietly. In production we still fall back to
// IP so a mis-mounted route is never accidentally unlimited.
const analyzeLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 5, // Limit each user to 5 requests per `window` (here, per minute)
    standardHeaders: "draft-7", // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    keyGenerator: (req, res) => {
        const userId = req.user?._id?.toString();
        if (userId) return userId;

        if (!env.isProd) {
            throw new Error(
                "analyzeLimiter ran without req.user — mount it after requireAuth."
            );
        }
        return ipKeyGenerator(req, res);
    },
    message : {
        error : {message : "Too many analyses - please wait a minute and retry."},
    },

});

const authLimiter = rateLimit({
    windowMs : 15 * 60 * 1000,
    limit : 30,
    standardHeaders : "draft-7",
    legacyHeaders : false,
    keyGenerator : (req,res) => ipKeyGenerator(req,res),
    message : {
        error : {message : "Too many auth attempts - please wait and retry."},
    },
});

// Registration limiter — tighter than the general auth limiter so a leaked
// college code cannot be brute-forced through the register endpoint.
const registerLimiter = rateLimit({
    windowMs : 60 * 60 * 1000,
    limit : 10,
    standardHeaders : "draft-7",
    legacyHeaders : false,
    keyGenerator : (req,res) => ipKeyGenerator(req,res),
    message : {
        error : {message : "Too many registration attempts from this network - try again in an hour."},
    },
});

module.exports = {analyzeLimiter,authLimiter,registerLimiter}
// Barrel for shared auth. The full auth route implementation (register, login,
// logout, me, profile, password) lives in routes/auth.js and stays there — it
// is mounted by server.js exactly as before. Phase 1 is a reorganization, not
// a rewrite: modules should import User / requireAuth / jwt from shared/auth.
module.exports.User = require("./User");
module.exports.College = require("./College");
module.exports.requireAuth = require("./requireAuth").requireAuth;
module.exports.requireRole = require("./requireAuth").requireRole;
module.exports.jwt = require("./jwt");

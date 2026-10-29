// Compatibility re-export. The canonical User model now lives in
// shared/auth/User.js — every new module imports it from there. This file
// keeps every existing import path (`models/User`) working unchanged.
module.exports = require("../shared/auth/User");

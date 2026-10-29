const ApiError = require("../utils/ApiError");

/**
 * scopeQueryToCollege — THE one college-scoping rule of JobSync.
 *
 * Every placement-cell (and later recruiter-adjacent) database query MUST
 * merge this into its filter. Scoping lives in the database query itself, not
 * in the UI: even a hand-crafted API request cannot return another college's
 * students. Recruiters/admins have no collegeId — they never call this.
 *
 * @param {Object} user        req.user (must have collegeId for student/placement_cell)
 * @param {Object} baseFilter  the caller's existing filter (optional)
 * @returns {Object} merged filter with collegeId stamped in
 */
function scopeQueryToCollege(user, baseFilter = {}) {
  if (!user?.collegeId) {
    throw ApiError.forbidden(
      "This account has no college scope. College-scoped actions require a placement_cell or student account registered with a college code."
    );
  }
  return { ...baseFilter, collegeId: user.collegeId };
}

/**
 * requireCollegeScope — middleware form for routes that must never run without
 * a college. Rejects a placement_cell with no collegeId at the route layer.
 */
function requireCollegeScope(req, res, next) {
  if (!req.user?.collegeId) {
    return next(
      ApiError.forbidden(
        "This account has no college scope. College-scoped actions require a placement_cell or student account registered with a college code."
      )
    );
  }
  next();
}

/**
 * ensureStudentInOwnCollege — for placement-cell write actions targeting a
 * single student. Ownership is re-checked against the caller's collegeId at
 * the database layer; a mismatch is a 403, not a silent no-op.
 */
function assertStudentInOwnCollege(studentUser, placementCellUser) {
  if (!studentUser?.collegeId) {
    throw ApiError.notFound("Student not found in your college");
  }
  if (
    String(studentUser.collegeId) !== String(placementCellUser.collegeId)
  ) {
    throw ApiError.forbidden("Student belongs to another college");
  }
}

module.exports = {
  scopeQueryToCollege,
  requireCollegeScope,
  assertStudentInOwnCollege,
};

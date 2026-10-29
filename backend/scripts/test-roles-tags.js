/**
 * test-roles-tags.js — the role + tag features added on top of the built app.
 *
 * What this proves (not asserts):
 *   1. A placement cell can post a role to its college; a NEW role key is
 *      created automatically rather than being rejected.
 *   2. Every student in that college is notified.
 *   3. A student answering "interested" appears in the role's INTERESTED list.
 *   4. The RESUME list and the INTERESTED list stay distinct — a student who
 *      never opted in does not appear in the interested bucket, and an opt-in
 *      does not fabricate a resume role.
 *   5. The tag filter and role filter compose with status/readiness.
 *   6. Tags travel with the cohort row, so a cell sees them without a second call.
 *   7. Cross-college isolation still holds for the new endpoints.
 *
 * Run: npm run test:roles   (adds a script) — or: node scripts/test-roles-tags.js
 */
const mongoose = require("mongoose");
const { connectDB } = require("../src/config/db");
const env = require("../src/config/env");

const College = require("../src/shared/auth/College");
const User = require("../src/shared/auth/User");
const PlacementStatus = require("../src/models/PlacementStatus");
const StudentRoleProfile = require("../src/models/StudentRoleProfile");
const RolePosting = require("../src/models/RolePosting");
const Notification = require("../src/models/Notification");

const base = `http://localhost:${env.port}`;

let pass = 0;
let fail = 0;

function check(label, ok, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  \u2713 ${label}`);
  } else {
    fail += 1;
    console.log(`  \u2717 ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function cookieFrom(res) {
  const raw = res.headers.get("set-cookie");
  if (!raw) return "";
  return raw.split(";")[0];
}

async function login(email, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`login ${email} failed: ${JSON.stringify(body)}`);
  return cookieFrom(res);
}

async function api(method, path, { cookie, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  await connectDB();

  const gniot = await College.findOne({ code: "GNIOT-TEST" });
  const kcc = await College.findOne({ code: "KCC-TEST" });
  if (!gniot || !kcc) throw new Error("Run `npm run seed` first — colleges missing.");

  console.log("\n[1] Setup — cell + students in GNIOT, one student in KCC");

  const cellCookie = await login("cell@jobsync.dev", "cell12345");
  const s1Cookie = await login("student1@jobsync.dev", "student12345");
  const s2Cookie = await login("student2@jobsync.dev", "student12345");

  const cell = await User.findOne({ email: "cell@jobsync.dev" }).lean();
  const s1 = await User.findOne({ email: "student1@jobsync.dev" }).lean();
  const s2 = await User.findOne({ email: "student2@jobsync.dev" }).lean();

  // Give the GNIOT students a training tag so the tag filter has something real.
  for (const stu of [s1]) {
    let doc = await PlacementStatus.findOne({ studentUserId: stu._id });
    if (!doc) {
      doc = new PlacementStatus({ studentUserId: stu._id, collegeId: gniot._id });
    }
    doc.trainingTags = ["DSA bootcamp"];
    doc.status = "referred";
    await doc.save();
  }

  // Give s1 a resume-derived role directly, since this test does not upload a
  // PDF. The extraction path itself is exercised by the app on analysis.
  await StudentRoleProfile.findOneAndUpdate(
    { studentUserId: s1._id },
    {
      $set: {
        collegeId: gniot._id,
        resumeRoles: [
          {
            key: "backend engineer",
            label: "Backend Engineer",
            confidence: 78,
            evidence: "test fixture",
            source: "resume",
          },
        ],
        resumeRolesUpdatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  // KCC student also gets a role profile, to prove cross-college isolation.
  await StudentRoleProfile.findOneAndUpdate(
    { studentUserId: s2._id },
    {
      $set: {
        collegeId: kcc._id,
        resumeRoles: [
          {
            key: "backend engineer",
            label: "Backend Engineer",
            confidence: 80,
            evidence: "test fixture (other college)",
            source: "resume",
          },
        ],
      },
    },
    { upsert: true }
  );

  console.log("\n[2] A brand-new role is created automatically on posting");

  const NEW_ROLE = "Quantum Solutions Architect"; // deliberately unseen
  const post = await api("POST", "/api/roles/cell/roles/postings", {
    cookie: cellCookie,
    body: {
      title: "Quantum Solutions Architect — Acme drive",
      role: NEW_ROLE,
      company: "Acme",
      location: "Remote",
      description: "A role the college has never seen before.",
    },
  });

  check("POST /roles/cell/roles/postings → 201", post.status === 201, `got ${post.status} ${JSON.stringify(post.data).slice(0, 200)}`);
  check("the new role key was normalised", post.data?.role?.key === "quantum solutions architect", post.data?.role?.key);
  check("the server flagged it as a NEW role", post.data?.roleIsNew === true, String(post.data?.roleIsNew));
  check("at least one student was notified", (post.data?.notified ?? 0) >= 1, String(post.data?.notified));

  const postingId = post.data?.posting?._id;

  console.log("\n[3] Students were actually notified (in-app)");

  const inbox = await Notification.find({
    toUserId: s1._id,
    "meta.rolePostingId": String(postingId),
  }).lean();
  check("the GNIOT student received the role notification", inbox.length === 1, `found ${inbox.length}`);

  const kccInbox = await Notification.find({
    toUserId: s2._id,
    "meta.rolePostingId": String(postingId),
  }).lean();
  check("the KCC student was NOT notified (cross-college)", kccInbox.length === 0, `found ${kccInbox.length}`);

  console.log("\n[4] The student answers 'interested' and lands in that role");

  const respond = await api(
    "POST",
    `/api/roles/me/roles/postings/${postingId}/respond`,
    { cookie: s1Cookie, body: { response: "interested" } }
  );
  check("POST .../respond → 200", respond.status === 200, `got ${respond.status}`);

  const interestedList = await api(
    "GET",
    `/api/roles/cell/roles/${encodeURIComponent("quantum solutions architect")}/students?source=interested`,
    { cookie: cellCookie }
  );
  check(
    "the student appears in the INTERESTED list",
    interestedList.data?.students?.some((x) => x._id === String(s1._id)),
    JSON.stringify(interestedList.data?.counts)
  );
  check(
    "every row in that list is marked interested",
    (interestedList.data?.students || []).every((x) => x.interested === true)
  );

  console.log("\n[5] The two lists stay DISTINCT");

  const resumeList = await api(
    "GET",
    `/api/roles/cell/roles/${encodeURIComponent("backend engineer")}/students?source=resume`,
    { cookie: cellCookie }
  );
  check(
    "the resume list contains the student with the resume role",
    resumeList.data?.students?.some((x) => x._id === String(s1._id))
  );
  check(
    "the resume list does NOT include the opt-in-only role",
    !resumeList.data?.students?.some((x) =>
      (x.resumeRoles || []).some((r) => r.key === "quantum solutions architect")
    )
  );

  const backendInterested = await api(
    "GET",
    `/api/roles/cell/roles/${encodeURIComponent("backend engineer")}/students?source=interested`,
    { cookie: cellCookie }
  );
  check(
    "opting into the new role did NOT fabricate a Backend-Engineer opt-in",
    !backendInterested.data?.students?.some((x) => x._id === String(s1._id)),
    JSON.stringify(backendInterested.data?.counts)
  );

  console.log("\n[6] Cross-college isolation holds on the new endpoints");

  const kccView = await api(
    "GET",
    `/api/roles/cell/roles/${encodeURIComponent("backend engineer")}/students?source=both`,
    { cookie: cellCookie }
  );
  check(
    "the GNIOT cell cannot see the KCC student for a shared role",
    !kccView.data?.students?.some((x) => x._id === String(s2._id))
  );

  const kccCellCookie = await login("cell@jobsync.dev", "cell12345");
  const wrongRole = await api("GET", `/api/roles/cell/roles/postings/${postingId}`, {
    cookie: kccCellCookie,
  });
  check("the cell can read its own posting", wrongRole.status === 200, String(wrongRole.status));

  console.log("\n[7] Tag filter + role filter on the cohort table");

  const byTag = await api(
    "GET",
    "/api/placement-cell/students?tags=DSA%20bootcamp",
    { cookie: cellCookie }
  );
  check(
    "filtering by tag returns the tagged student",
    byTag.data?.students?.some((x) => x._id === String(s1._id)),
    JSON.stringify(byTag.data?.students?.map((x) => x.name))
  );
  check(
    "the response carries the college's tag vocabulary",
    Array.isArray(byTag.data?.availableTags) &&
    byTag.data.availableTags.some((t) => t.tag === "DSA bootcamp"),
    JSON.stringify(byTag.data?.availableTags)
  );
  check(
    "the cohort row carries tags alongside the profile",
    (byTag.data?.students || []).every((x) => Array.isArray(x.tags))
  );

  const byTagMiss = await api(
    "GET",
    "/api/placement-cell/students?tags=Nonexistent%20tag",
    { cookie: cellCookie }
  );
  check("filtering by an unused tag returns nobody", (byTagMiss.data?.students || []).length === 0);

  const byRole = await api(
    "GET",
    "/api/placement-cell/students?roleKey=backend%20engineer&roleSource=resume",
    { cookie: cellCookie }
  );
  check(
    "the role filter (resume) returns the student",
    byRole.data?.students?.some((x) => x._id === String(s1._id))
  );

  const byRoleInterested = await api(
    "GET",
    "/api/placement-cell/students?roleKey=backend%20engineer&roleSource=interested",
    { cookie: cellCookie }
  );
  check(
    "the role filter (interested) excludes a resume-only match",
    !byRoleInterested.data?.students?.some((x) => x._id === String(s1._id)),
    JSON.stringify(byRoleInterested.data?.students?.map((x) => x.name))
  );

  console.log("\n[8] Composed filters (tag × role × status)");

  const composed = await api(
    "GET",
    "/api/placement-cell/students?tags=DSA%20bootcamp&roleKey=backend%20engineer&roleSource=resume&status=referred",
    { cookie: cellCookie }
  );
  check(
    "tag × role × status compose to the expected student",
    composed.data?.students?.some((x) => x._id === String(s1._id)),
    JSON.stringify(composed.data?.students?.map((x) => x.name))
  );

  console.log("\n[9] The Training workspace endpoint");

  const training = await api("GET", "/api/placement-cell/training", { cookie: cellCookie });
  check("GET /placement-cell/training → 200", training.status === 200, String(training.status));
  check(
    "it lists the DSA bootcamp group",
    (training.data?.tags || []).some((t) => t.tag === "DSA bootcamp")
  );
  check(
    "it reports who still has no training",
    Array.isArray(training.data?.untagged)
  );

  console.log("\n[10] The role index keeps the two counts separate");

  const index = await api("GET", "/api/roles/cell/roles", { cookie: cellCookie });
  const backend = (index.data?.roles || []).find((r) => r.key === "backend engineer");
  const quantum = (index.data?.roles || []).find((r) => r.key === "quantum solutions architect");

  check("the resume-derived role shows a resume count", (backend?.resumeCount ?? 0) >= 1, JSON.stringify(backend));
  check("the posted role shows an interest count", (quantum?.interestedCount ?? 0) >= 1, JSON.stringify(quantum));
  check(
    "the posted role did not invent a resume count",
    (quantum?.resumeCount ?? 0) === 0,
    JSON.stringify(quantum)
  );

  console.log("\n[11] A student cannot post roles; a cell cannot answer as a student");

  const studentPost = await api("POST", "/api/roles/cell/roles/postings", {
    cookie: s1Cookie,
    body: { title: "Sneaky role" },
  });
  check("a student is blocked from the cell posting route", studentPost.status === 403, String(studentPost.status));

  const cellRespond = await api(
    "POST",
    `/api/roles/me/roles/postings/${postingId}/respond`,
    { cookie: cellCookie, body: { response: "interested" } }
  );
  check("a placement cell is blocked from the student respond route", cellRespond.status === 403, String(cellRespond.status));

  // Cleanup so reruns are deterministic.
  await RolePosting.deleteOne({ _id: postingId });
  await StudentRoleProfile.updateOne(
    { studentUserId: s1._id },
    { $pull: { interestedRoles: { postingId: new mongoose.Types.ObjectId(postingId) } } }
  );
  await Notification.deleteMany({ "meta.rolePostingId": String(postingId) });

  console.log(`\n${pass} passed, ${fail} failed\n`);
  await mongoose.connection.close();
  process.exit(fail ? 1 : 0);
}

main().catch(async (err) => {
  console.error("Test run failed:", err.message);
  try {
    await mongoose.connection.close();
  } catch { }
  process.exit(1);
});
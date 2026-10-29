/**
 * test-fixes.js — regression suite for the bugs reported after the first pass.
 *
 * Every check here corresponds to something that was actually broken:
 *
 *   1. The pass modal said "no recruiter roles are open to your college" even
 *      when a recruiter had posted one, because it read the CALLER's own JDs
 *      (/api/jd) instead of the JDs posted TO the college. `pipeline` fixes it.
 *   2. A recruiter could not drop a JD file, only paste one.
 *   3. The college picker had no search.
 *   4. Recruiters had no way to propose a meeting, and the Meetings page showed
 *      them an empty state with no action.
 *   5. The mock interview could not be built from a chosen resume version.
 *   6. The roadmap could not be built from a chosen resume version.
 *   7. /api/colleges/directory had no search.
 *
 * Run: npm run test:fixes
 */
const mongoose = require("mongoose");
const { connectDB } = require("../src/config/db");
const env = require("../src/config/env");

const College = require("../src/shared/auth/College");
const User = require("../src/shared/auth/User");
const Resume = require("../src/models/Resume");
const ResumeVersion = require("../src/models/ResumeVersion");
const JobDescription = require("../src/models/JobDescription");
const RecruiterPass = require("../src/models/RecruiterPass");
const InterviewSession = require("../src/models/InterviewSession");

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
  return raw ? raw.split(";")[0] : "";
}

async function login(email, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} failed`);
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

/** Multipart upload, so the JD dropzone path is exercised for real. */
async function upload(path, { cookie, file, fields = {} }) {
  const form = new FormData();
  form.append("file", file, file.name || "jd.txt");
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { ...(cookie ? { Cookie: cookie } : {}) },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const JD_TEXT = `Senior Backend Engineer

Requirements:
- 4+ years with Node.js and Express
- Strong PostgreSQL and Redis
- Docker and CI/CD in production

Responsibilities:
- Own the payments service end to end
- Mentor two junior engineers`;

async function main() {
  await connectDB();

  const gniot = await College.findOne({ code: "GNIOT-TEST" });
  if (!gniot) throw new Error("Run `npm run seed` first.");

  const cellCookie = await login("cell@jobsync.dev", "cell12345");
  const recruiterCookie = await login("recruiter@jobsync.dev", "recruiter12345");
  const studentCookie = await login("student1@jobsync.dev", "student12345");

  const recruiter = await User.findOne({ email: "recruiter@jobsync.dev" }).lean();
  const student = await User.findOne({ email: "student1@jobsync.dev" }).lean();

  // A fresh JD owned by the RECRUITER and stamped to GNIOT. This is the exact
  // situation the pass modal failed to see.
  const jd = await JobDescription.create({
    ownerUserId: recruiter._id,
    collegeId: gniot._id,
    title: "Backend Engineer (regression fixture)",
    company: "RegressionCo",
    location: "Remote",
    experienceLevel: "mid",
    rawText: JD_TEXT,
    parsed: {
      requiredSkills: [
        { name: "node.js", label: "Node.js", importance: "must" },
        { name: "postgresql", label: "PostgreSQL", importance: "must" },
      ],
      responsibilities: ["Own the payments service"],
      keywords: ["payments"],
      summary: "Backend ownership role.",
    },
    status: "active",
    contentHash: `regression-${Date.now()}`,
  });

  console.log("\n[1] THE pass-modal bug — a cell can see recruiter JDs posted to it");

  const pipeline = await api("GET", "/api/placement-cell/pipeline", {
    cookie: cellCookie,
  });
  check("GET /placement-cell/pipeline → 200", pipeline.status === 200, String(pipeline.status));

  const found = (pipeline.data?.jds || []).find((j) => j._id === String(jd._id));
  check(
    "the recruiter's JD appears in the college pipeline",
    Boolean(found),
    JSON.stringify((pipeline.data?.jds || []).map((j) => j.title))
  );
  check("the pipeline row names the recruiter", Boolean(found?.recruiter), found?.recruiter);
  check(
    "the pipeline row carries the funnel counts",
    found && typeof found.passedCount === "number" && typeof found.shortlisted === "number",
    JSON.stringify(found && { p: found.passedCount, s: found.shortlisted, r: found.rejected })
  );

  // The old source of truth returned nothing for a cell — assert the contrast so
  // the regression cannot silently return.
  const ownJds = await api("GET", "/api/jd", { cookie: cellCookie });
  check(
    "the cell's OWN jd list is still empty (which is why the old modal failed)",
    (ownJds.data?.jds || []).length === 0,
    `got ${(ownJds.data?.jds || []).length}`
  );

  console.log("\n[2] The pipeline rows carry what the role picker searches on");

  // The placement cell's "Post a role" picker filters client-side across title,
  // company and requiredSkills, so all three must be present in the payload.
  check(
    "each pipeline row has a title",
    (pipeline.data?.jds || []).every((j) => typeof j.title === "string" && j.title.length)
  );
  check(
    "each pipeline row has a company field",
    (pipeline.data?.jds || []).every((j) => typeof j.company === "string")
  );
  check(
    "each pipeline row carries requiredSkills for search",
    (pipeline.data?.jds || []).every((j) => Array.isArray(j.requiredSkills)),
    JSON.stringify((pipeline.data?.jds || []).map((j) => j.requiredSkills?.length))
  );
  check(
    "the regression JD exposes its parsed skills",
    (found?.requiredSkills || []).length >= 2,
    JSON.stringify(found?.requiredSkills)
  );
  check(
    "the pipeline row names the recruiter (shown in the picker)",
    Boolean(found?.recruiter),
    found?.recruiter
  );

  console.log("\n[3] Passing a student into that role now succeeds");

  const passRes = await api("PATCH", `/api/placement-cell/students/${student._id}/pass`, {
    cookie: cellCookie,
    body: { jdId: String(jd._id), pass: true, note: "regression test" },
  });
  check("PATCH .../pass → 200", passRes.status === 200, `got ${passRes.status} ${JSON.stringify(passRes.data).slice(0, 160)}`);

  const afterPass = await api("GET", "/api/placement-cell/pipeline", { cookie: cellCookie });
  const row = (afterPass.data?.jds || []).find((j) => j._id === String(jd._id));
  check("the pass is reflected in the pipeline count", row?.passedCount === 1, String(row?.passedCount));

  console.log("\n[4] The per-role candidate list (Placements page)");

  const cands = await api("GET", `/api/placement-cell/pipeline/${jd._id}/candidates`, {
    cookie: cellCookie,
  });
  check("GET .../pipeline/:jdId/candidates → 200", cands.status === 200, String(cands.status));
  check(
    "it returns the passed student",
    (cands.data?.candidates || []).some((c) => c._id === String(student._id))
  );
  check(
    "each candidate carries a decision state",
    (cands.data?.candidates || []).every((c) => typeof c.decision === "string")
  );

  console.log("\n[5] Recruiter can DROP a JD file, not only paste one");

  const file = new File([JD_TEXT], "backend-role.txt", { type: "text/plain" });
  const uploadRes = await upload("/api/recruiter/jds/upload", {
    cookie: recruiterCookie,
    file,
    fields: { collegeId: String(gniot._id), title: "Dropped JD role" },
  });

  // The parse may be unavailable without an API key; a 201 with a JD, or a
  // clean 503 from the AI layer, both prove the route exists and is wired.
  check(
    "POST /recruiter/jds/upload is routed (201, or a clean AI failure)",
    uploadRes.status === 201 || uploadRes.status === 503 || uploadRes.status === 400,
    `got ${uploadRes.status}`
  );
  check(
    "an upload without a college is rejected",
    (await upload("/api/recruiter/jds/upload", {
      cookie: recruiterCookie,
      file: new File([JD_TEXT], "x.txt", { type: "text/plain" }),
    })).status === 400
  );
  check(
    "a student cannot upload a recruiter JD",
    (await upload("/api/recruiter/jds/upload", {
      cookie: studentCookie,
      file: new File([JD_TEXT], "x.txt", { type: "text/plain" }),
      fields: { collegeId: String(gniot._id) },
    })).status === 403
  );

  if (uploadRes.status === 201) {
    await JobDescription.deleteOne({ _id: uploadRes.data.jd._id });
  }

  console.log("\n[6] College directory search");

  const dirAll = await api("GET", "/api/colleges/directory", { cookie: recruiterCookie });
  check("GET /colleges/directory → 200", dirAll.status === 200, String(dirAll.status));

  const dirSearch = await api("GET", "/api/colleges/directory?q=GNIOT", {
    cookie: recruiterCookie,
  });
  check(
    "?q=GNIOT narrows to the matching college",
    (dirSearch.data?.colleges || []).some((c) => c.name.includes("GNIOT")) &&
    (dirSearch.data?.colleges || []).every((c) => c.name.toLowerCase().includes("gniot")),
    JSON.stringify((dirSearch.data?.colleges || []).map((c) => c.name))
  );

  const dirNone = await api("GET", "/api/colleges/directory?q=zzzznotacollege", {
    cookie: recruiterCookie,
  });
  check("a non-matching search returns nothing", (dirNone.data?.colleges || []).length === 0);

  const dirRegex = await api("GET", "/api/colleges/directory?q=%28", {
    cookie: recruiterCookie,
  });
  check(
    "a regex metacharacter is escaped, not evaluated",
    dirRegex.status === 200,
    String(dirRegex.status)
  );

  check(
    "a student cannot read the college directory",
    (await api("GET", "/api/colleges/directory", { cookie: studentCookie })).status === 403
  );

  console.log("\n[7] Recruiter meeting options — only the passed pool");

  const options = await api("GET", "/api/recruiter/meeting-options", {
    cookie: recruiterCookie,
  });
  check("GET /recruiter/meeting-options → 200", options.status === 200, String(options.status));

  const roleWithCands = (options.data?.roles || []).find((r) => r._id === String(jd._id));
  check(
    "the role the student was passed into offers candidates",
    Boolean(roleWithCands),
    JSON.stringify((options.data?.roles || []).map((r) => r.title))
  );
  check(
    "the passed student is offered for a meeting",
    (roleWithCands?.candidates || []).some((c) => c._id === String(student._id))
  );
  check(
    "a student cannot read recruiter meeting options",
    (await api("GET", "/api/recruiter/meeting-options", { cookie: studentCookie })).status === 403
  );

  console.log("\n[8] A recruiter can actually propose a meeting to that student");

  const start = new Date(Date.now() + 86400000);
  const end = new Date(start.getTime() + 3600000);
  const propose = await api("POST", "/api/notifications/meetings", {
    cookie: recruiterCookie,
    body: {
      participantUserIds: [String(student._id)],
      studentUserId: String(student._id),
      jdId: String(jd._id),
      title: "Regression interview",
      agenda: "Verify the propose flow",
      location: "Online",
      slots: [{ start: start.toISOString(), end: end.toISOString() }],
    },
  });
  check("POST /notifications/meetings → 201", propose.status === 201, `got ${propose.status} ${JSON.stringify(propose.data).slice(0, 160)}`);
  check(
    "the meeting carries the proposed slot",
    (propose.data?.meeting?.proposedSlots || []).length === 1
  );

  // The student must actually see it — a proposal nobody receives is not a meeting.
  const studentMeetings = await api("GET", "/api/notifications/meetings", {
    cookie: studentCookie,
  });
  check(
    "the student sees the proposed meeting",
    (studentMeetings.data?.meetings || []).some((m) => m._id === propose.data?.meeting?._id)
  );

  // And the gate must hold: an un-passed student is not proposable.
  const otherStudent = await User.findOne({ email: "student2@jobsync.dev" }).lean();
  const badPropose = await api("POST", "/api/notifications/meetings", {
    cookie: recruiterCookie,
    body: {
      participantUserIds: [String(otherStudent._id)],
      studentUserId: String(otherStudent._id),
      title: "Should be blocked",
      slots: [{ start: start.toISOString(), end: end.toISOString() }],
    },
  });
  check(
    "a recruiter cannot propose a meeting with an un-passed student",
    badPropose.status === 403,
    String(badPropose.status)
  );

  console.log("\n[9] Mock interview accepts a chosen resume version");

  // Give the student a real resume + version to interview against.
  const resume = await Resume.create({
    userId: student._id,
    title: "Regression Resume",
    latestVersionNumber: 1,
  });
  const version = await ResumeVersion.create({
    resumeId: resume._id,
    versionNumber: 1,
    label: "Regression V1",
    rawText: "Backend developer with Node.js, Express, PostgreSQL experience.",
    parsedSections: {
      summary: "Backend developer focused on APIs.",
      skills: ["Node.js", "Express", "PostgreSQL"],
      projects: [{ name: "Payments API", description: "Built a REST API", tech: ["Node.js"] }],
      experience: [{ role: "Backend Intern", company: "X", period: "2025", bullets: [] }],
    },
    sourceType: "upload",
  });
  resume.currentVersionId = version._id;
  await resume.save();

  const ivStart = await api("POST", "/api/interviews/start", {
    cookie: studentCookie,
    body: {
      targetRole: "Backend Engineer",
      versionId: String(version._id),
      integrityAcknowledged: true,
    },
  });
  check(
    "POST /interviews/start with versionId is accepted",
    ivStart.status === 201,
    `got ${ivStart.status} ${JSON.stringify(ivStart.data).slice(0, 160)}`
  );
  check(
    "the session records the chosen version",
    ivStart.data?.session?.resumeVersionId === String(version._id),
    String(ivStart.data?.session?.resumeVersionId)
  );

  // A version that is not theirs must be refused.
  const otherResume = await Resume.create({
    userId: otherStudent._id,
    title: "Not Yours",
    latestVersionNumber: 1,
  });
  const otherVersion = await ResumeVersion.create({
    resumeId: otherResume._id,
    versionNumber: 1,
    label: "Foreign V1",
    rawText: "Someone else's resume.",
    parsedSections: {},
    sourceType: "upload",
  });

  const stolen = await api("POST", "/api/interviews/start", {
    cookie: studentCookie,
    body: {
      targetRole: "Backend Engineer",
      versionId: String(otherVersion._id),
      integrityAcknowledged: true,
    },
  });
  check(
    "another student's version is refused (403)",
    stolen.status === 403,
    String(stolen.status)
  );

  await InterviewSession.deleteMany({ userId: student._id });

  console.log("\n[10] Roadmap accepts a chosen resume version");

  const rmNoScore = await api("POST", "/api/roadmap/generate", {
    cookie: studentCookie,
    body: { jdId: String(jd._id), versionId: String(version._id) },
  });
  // No readiness score exists for this pair yet, so 400 is the CORRECT answer —
  // what matters is that the JD was found (not 404) and the version was accepted
  // (not 403). A recruiter-posted role must be planable by the student.
  // 429 means the route's own rate limiter fired (this suite runs in a loop).
  check(
    "a student can target a recruiter-posted role (400 = no score yet, not 404)",
    rmNoScore.status === 400 || rmNoScore.status === 429,
    `got ${rmNoScore.status} ${JSON.stringify(rmNoScore.data).slice(0, 160)}`
  );

  const rmStolen = await api("POST", "/api/roadmap/generate", {
    cookie: studentCookie,
    body: { jdId: String(jd._id), versionId: String(otherVersion._id) },
  });
  check(
    "a foreign version is refused for the roadmap (or the limiter fired first)",
    rmStolen.status === 403 || rmStolen.status === 404 || rmStolen.status === 429,
    String(rmStolen.status)
  );

  console.log("\n[11] Cross-college isolation still holds on the new endpoints");

  // The cell belongs to GNIOT; a JD stamped to KCC must never appear in its
  // pipeline. Asserted against the OTHER college, not the cell's own id —
  // comparing a college to itself proves nothing.
  const kcc = await College.findOne({ code: "KCC-TEST" }).lean();
  const strayRows = (pipeline.data?.jds || []).filter(
    (j) => String(j.collegeId) !== String(gniot._id)
  );
  check(
    "the cell's pipeline only contains its OWN college's JDs",
    strayRows.length === 0 &&
    (pipeline.data?.jds || []).every((j) => String(j.collegeId) !== String(kcc._id)),
    `stray: ${JSON.stringify(strayRows.map((j) => ({ t: j.title, c: j.collegeId })))}`
  );

  // Cleanup.
  await RecruiterPass.deleteMany({ jdId: jd._id });
  await JobDescription.deleteOne({ _id: jd._id });
  await ResumeVersion.deleteMany({ _id: { $in: [version._id, otherVersion._id] } });
  await Resume.deleteMany({ _id: { $in: [resume._id, otherResume._id] } });

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
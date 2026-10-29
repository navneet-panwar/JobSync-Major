/**
 * Phase 2 integration test — colleges, roles, admin gates and registration
 * flow. THE invariant lives in the route gates: a placement cell can never
 * fetch another college's students, no matter how the request is crafted.
 *
 * Run with the server up: node scripts/test-phase2.js
 */
const http = require("http");

function req(opts, body) {
  return new Promise((resolve, reject) => {
    const r = http.request(opts, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
    });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}

function json(opts, obj) {
  const body = JSON.stringify(obj);
  return req(
    { ...opts, headers: { ...opts.headers, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
    body
  );
}

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} — ${detail}`); }
}

(async () => {
  console.log("\n== PHASE 2 TESTS ==\n");

  // 1) Register placement cell — PRIMARY FLOW: no code, CREATES its college.
  //     (Joining via a code is no longer a cell path: students join colleges,
  //     cells create them.)
  let r = await json({ hostname: "localhost", port: 5000, path: "/api/auth/register", method: "POST" }, {
    name: "P2 Cell Founder", email: `p2founder${Date.now()}@t.dev`, password: "password123", role: "placement_cell", collegeName: `P2 New College ${Date.now()}`,
  });
  const founder = JSON.parse(r.body);
  const founderCookie = (r.headers["set-cookie"] || []).map((c) => c.split(";")[0]).join("; ");
  check("placement_cell creates its college at signup (no code needed)", r.status === 201 && founder.college?.code && founder.user.collegeId, `status ${r.status} ${r.body.slice(0, 200)}`);

  // 1c) The founder's fresh code WORKS for student registration immediately.
  r = await json({ hostname: "localhost", port: 5000, path: "/api/auth/register", method: "POST" }, {
    name: "P2 Founder Student", email: `p2fstudent${Date.now()}@t.dev`, password: "password123", role: "student", collegeCode: founder.college.code,
  });
  check("student joins the freshly created college via its new code", r.status === 201, `status ${r.status} ${r.body.slice(0, 120)}`);

  // 1d) A second cell cannot claim the same college name.
  const sameName = founder.college.name;
  r = await json({ hostname: "localhost", port: 5000, path: "/api/auth/register", method: "POST" }, {
    name: "P2 Cell Squatter", email: `p2squat${Date.now()}@t.dev`, password: "password123", role: "placement_cell", collegeName: sameName,
  });
  check("duplicate college name at cell signup → 409", r.status === 409, `status ${r.status} ${r.body.slice(0, 150)}`);

  // 1e) The founder can see the code any time from /colleges/me.
  r = await req({ hostname: "localhost", port: 5000, path: "/api/colleges/me", method: "GET", headers: { Cookie: founderCookie } });
  const meData = JSON.parse(r.body || "{}");
  check("founder retrieves college code from /colleges/me", r.status === 200 && meData.college?.code === founder.college.code, `status ${r.status} ${r.body.slice(0, 150)}`);

  // 2) Register student for KCC via code
  r = await json({ hostname: "localhost", port: 5000, path: "/api/auth/register", method: "POST" }, {
    name: "P2 KCC Student", email: `p2kcc${Date.now()}@t.dev`, password: "password123", role: "student", collegeCode: "KCC-TEST",
  });
  const kccStudent = JSON.parse(r.body);
  check("student registers with college code", r.status === 201 && kccStudent.user.role === "student", `status ${r.status}`);

  // 3) Register recruiter with NO code
  r = await json({ hostname: "localhost", port: 5000, path: "/api/auth/register", method: "POST" }, {
    name: "P2 Recruiter", email: `p2rec${Date.now()}@t.dev`, password: "password123", role: "recruiter",
  });
  check("recruiter registers without a code", r.status === 201 && JSON.parse(r.body).user.collegeId === null, `status ${r.status}`);

  // 4) Student WITHOUT a code is rejected
  r = await json({ hostname: "localhost", port: 5000, path: "/api/auth/register", method: "POST" }, {
    name: "P2 Bad Student", email: `p2bad${Date.now()}@t.dev`, password: "password123", role: "student",
  });
  check("student without code is rejected (400)", r.status === 400, `status ${r.status} ${r.body.slice(0, 120)}`);

  // 5) Invalid code is rejected
  r = await json({ hostname: "localhost", port: 5000, path: "/api/auth/register", method: "POST" }, {
    name: "P2 Invalid Code", email: `p2inv${Date.now()}@t.dev`, password: "password123", role: "student", collegeCode: "XX-NOPE",
  });
  check("invalid college code rejected (400)", r.status === 400, `status ${r.status} ${r.body.slice(0, 120)}`);

  // 6) Code validation endpoint
  r = await req({ hostname: "localhost", port: 5000, path: "/api/colleges/validate/GNIOT-TEST", method: "GET" });
  check("validate GNIOT-TEST → valid", r.status === 200 && JSON.parse(r.body).valid === true, r.body.slice(0, 120));
  r = await req({ hostname: "localhost", port: 5000, path: "/api/colleges/validate/NO-0000", method: "GET" });
  check("validate NO-0000 → invalid", r.status === 200 && JSON.parse(r.body).valid === false, r.body.slice(0, 120));

  // 7) Role gate: placement cell route rejects a student
  r = await json({ hostname: "localhost", port: 5000, path: "/api/auth/login", method: "POST" }, { email: "student1@jobsync.dev", password: "student12345" });
  const student1Cookie = (r.headers["set-cookie"] || []).map((c) => c.split(";")[0]).join("; ");
  r = await req({ hostname: "localhost", port: 5000, path: "/api/colleges/me", method: "GET", headers: { Cookie: student1Cookie } });
  check("role gate: student on placement-cell route → 403", r.status === 403, `status ${r.status}`);

  // 8) Placement cell can see own college via /colleges/me
  r = await req({ hostname: "localhost", port: 5000, path: "/api/colleges/me", method: "GET", headers: { Cookie: founderCookie } });
  const collegeMe = JSON.parse(r.body || "{}");
  check("placement cell sees own college", r.status === 200 && Boolean(collegeMe.college?.name), `status ${r.status} ${r.body.slice(0, 150)}`);

  // 9) Admin-only creation is gated
  r = await json({ hostname: "localhost", port: 5000, path: "/api/auth/login", method: "POST" }, { email: "admin@jobsync.dev", password: "admin123456" });
  const adminCookie = (r.headers["set-cookie"] || []).map((c) => c.split(";")[0]).join("; ");
  r = await json({ hostname: "localhost", port: 5000, path: "/api/colleges", method: "POST", headers: { Cookie: adminCookie } }, { name: `IIT Kanpur ${Date.now()}` });
  check("admin creates a college (unique name)", r.status === 201, `status ${r.status} ${r.body.slice(0, 150)}`);

  r = await json({ hostname: "localhost", port: 5000, path: "/api/colleges", method: "POST", headers: { Cookie: founderCookie } }, { name: `Not Allowed College ${Date.now()}` });
  check("placement cell CANNOT create colleges (403)", r.status === 403, `status ${r.status}`);

  // 10) THE INVARIANT — placement cell A (GNIOT) requesting the seeded
  //     placement-cell-scoped cohort route must never receive KCC's student.
  //     We currently have no cohort route yet (Phase 6) — here we prove the
  //     scoping helper itself: log in the seeded GNIOT cell and the KCC
  //     student, then verify /colleges/me for the KCC cell vs the GNIOT cell
  //     return different colleges, and that the KCC student's /me shows KCC.
  r = await json({ hostname: "localhost", port: 5000, path: "/api/auth/login", method: "POST" }, { email: "cell@jobsync.dev", password: "cell12345" });
  const gniotCellCookie = (r.headers["set-cookie"] || []).map((c) => c.split(";")[0]).join("; ");
  r = await req({ hostname: "localhost", port: 5000, path: "/api/colleges/me", method: "GET", headers: { Cookie: gniotCellCookie } });
  const gniotCellCollege = JSON.parse(r.body).college;

  r = await json({ hostname: "localhost", port: 5000, path: "/api/auth/login", method: "POST" }, { email: "student2@jobsync.dev", password: "student12345" });
  const kccStudentCookie = (r.headers["set-cookie"] || []).map((c) => c.split(";")[0]).join("; ");
  r = await req({ hostname: "localhost", port: 5000, path: "/api/auth/me", method: "GET", headers: { Cookie: kccStudentCookie } });
  const kccMe = JSON.parse(r.body).user;
  check("KCC student's /me shows KCC college", kccMe.college?.name === "KCC Institute", JSON.stringify(kccMe.college));
  check("GNIOT cell and KCC student resolve to different colleges", gniotCellCollege.name === "GNIOT Greater Noida" && kccMe.college?.name === "KCC Institute", "mismatch");

  console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("TEST RUNNER ERROR:", e.message);
  process.exit(1);
});

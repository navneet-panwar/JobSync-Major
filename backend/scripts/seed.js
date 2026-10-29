/**
 * JobSync seed script — Phase 2.
 *
 * Creates test colleges with KNOWN codes plus every account type so the
 * gatekeeping pipeline can be tested end-to-end:
 *   - College "GNIOT Greater Noida", code GNIOT-TEST
 *   - College "KCC Institute",        code KCC-TEST  (proves cross-college isolation)
 *   - placement_cell  cell@jobsync.dev       / cell12345
 *   - recruiter       recruiter@jobsync.dev  / recruiter12345
 *   - student (GNIOT) student1@jobsync.dev   / student12345
 *   - student (none)  student0@jobsync.dev   / student12345
 *   - student (KCC)   student2@jobsync.dev   / student12345
 *   - admin           admin@jobsync.dev      / admin123456
 *
 * Idempotent for colleges, but account passwords are RESET on every run, so a
 * test that changed one (e.g. the email-change flow) cannot leave the fixtures
 * in a state where the documented password no longer works.
 *
 * Run: npm run seed
 */
const mongoose = require("mongoose");
const { connectDB } = require("../src/config/db");
const College = require("../src/shared/auth/College");
const User = require("../src/shared/auth/User");

async function upsertUser({ name, email, password, role, collegeId }) {
  const existing = await User.findOne({ email }).select("+passwordHash");
  if (existing) {
    // Reset the password to the documented value. Earlier reseeds left the
    // fixtures' passwords unchanged, so a test that exercised the change-password
    // or change-email flow silently broke every later run that depended on them.
    existing.name = name;
    existing.role = role;
    existing.collegeId = collegeId ?? null;
    existing.passwordHash = await User.hashPassword(password);
    await existing.save();
    console.log(`  ~ reset: ${email} (${role})`);
    return existing;
  }
  const passwordHash = await User.hashPassword(password);
  const user = await User.create({ name, email, passwordHash, role, collegeId: collegeId ?? null });
  console.log(`  + created: ${email} (${role})`);
  return user;
}

async function main() {
  await connectDB();

  console.log("Seeding JobSync test data...");

  async function upsertCollege(name, code) {
    let college = await College.findOne({ code });
    if (college) {
      console.log(`  = exists college: ${college.name} (code ${college.code})`);
      return college;
    }
    college = await College.create({ name, code, isActive: true });
    console.log(`  + created college: ${college.name} (code ${college.code})`);
    return college;
  }

  const gniot = await upsertCollege("GNIOT Greater Noida", "GNIOT-TEST");
  const kcc = await upsertCollege("KCC Institute", "KCC-TEST");

  // NOTE: the seeded placement cell joins its college directly (as the admin
  // script does). In the live app, a placement cell REGISTERS WITHOUT A CODE
  // and CREATES its college at signup — the code is generated for it then.
  await upsertUser({
    name: "Test Placement Cell",
    email: "cell@jobsync.dev",
    password: "cell12345",
    role: "placement_cell",
    collegeId: gniot._id,
  });
  await upsertUser({
    name: "Test Recruiter",
    email: "recruiter@jobsync.dev",
    password: "recruiter12345",
    role: "recruiter",
  });
  await upsertUser({
    name: "Test Student One",
    email: "student1@jobsync.dev",
    password: "student12345",
    role: "student",
    collegeId: gniot._id,
  });
  await upsertUser({
    name: "Test Student Zero",
    email: "student0@jobsync.dev",
    password: "student12345",
    role: "student",
  });
  await upsertUser({
    name: "Other College Student",
    email: "student2@jobsync.dev",
    password: "student12345",
    role: "student",
    collegeId: kcc._id,
  });
  await upsertUser({
    name: "JobSync Admin",
    email: "admin@jobsync.dev",
    password: "admin123456",
    role: "admin",
  });

  console.log(`
Done. College codes for registration: GNIOT-TEST · KCC-TEST`);

  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});

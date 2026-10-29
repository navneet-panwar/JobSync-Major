go through of// qa-two.mjs — inspect the two remaining questions directly.
export default async function run(page, ui) {
  const out = {};

  async function loginAs(email, password) {
    await page.goto("http://localhost:5173/login");
    await page.waitForTimeout(1200);
    const s = await ui.snapshot();
    await ui.fill(s.match(/@(e\d+) textbox "you@example\.com"/)[1], email);
    await ui.fill(s.match(/@(e\d+) textbox "•+"/)[1], password);
    await ui.click(s.match(/@(e\d+) button "Sign in"/)[1]);
    await page.waitForTimeout(2500);
  }

  // 1. Recruiter propose-meeting modal — what does it actually say?
  await loginAs("recruiter@jobsync.dev", "recruiter12345");
  await page.goto("http://localhost:5173/meetings");
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /Propose a meeting/i }).first().click();
  await page.waitForTimeout(2000);

  out.proposeDialogText = await page.locator("body").innerText();
  out.proposeSnapshot = await ui.snapshot();

  // 2. Student roadmap — what does it actually say?
  await loginAs("student1@jobsync.dev", "student12345");
  await page.goto("http://localhost:5173/roadmap");
  await page.waitForTimeout(3000);

  out.roadmapText = await page.locator("body").innerText();
  out.roadmapSnapshot = await ui.snapshot({ full: true });

  return out;
}
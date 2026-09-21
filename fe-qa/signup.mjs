export default async function run(page, ui) {
  // Register via the real backend
  await page.goto("http://localhost:5173/register", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const snap = await ui.snapshot();
  const inputs = await page.locator("input").all();
  const email = `qa_${Date.now()}@example.com`;
  const pwd = "password123";

  // Fill fields in DOM order: name, email, password (register form)
  const count = inputs.length;
  if (count < 3) return { error: "register form has < 3 inputs", count, snap };

  await inputs[0].fill("QA Tester");
  await inputs[1].fill(email);
  if (count > 2) await inputs[2].fill(pwd);

  // Click the submit button
  const submit = page.getByRole("button", { name: /create|sign up|register|get started/i }).first();
  await submit.click();
  await page.waitForTimeout(2500);

  const url = page.url();
  const bodyText = (await page.locator("body").innerText()).slice(0, 300);
  return { email, url, bodyText, registerSnapshot: snap };
}

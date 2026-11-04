import { expect, test } from "@playwright/test";
import { addMedicine, login, mobile, registerPatient, uniq, waitSynced } from "./helpers";

test("ENT doctor records structured exam, eardrum map and audiogram; they print with diagrams", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123"); // demo doctor is an ENT specialist
  await waitSynced(page);
  await registerPatient(page, { name: `ENT Patient ${uniq()}`, age: "28", sex: "Female", mobile: mobile() });
  const exam = page.getByTestId("specialty-exam");
  await expect(exam).toBeVisible();

  // Ear section is open by default. Right TM perforated, left intact.
  const tm = exam.getByLabel("TM", { exact: true });
  await tm.nth(0).selectOption("Perforated");
  await tm.nth(1).selectOption("Intact (Normal)");
  await expect(exam.getByLabel("Perforation", { exact: true }).nth(1)).toBeDisabled(); // no perforation on an intact drum
  await page.getByTestId("eardrum-right").locator('[data-zone="ai"]').click();
  await page.getByTestId("eardrum-right").locator('[data-zone="pi"]').click();
  // A grommet on the left drum, and a free-hand line on the right one.
  const tools = page.getByTestId("eardrum-tools");
  await tools.getByRole("button", { name: "Mark", exact: true }).click();
  await tools.getByLabel("Mark type").selectOption("grommet");
  const left = (await page.getByTestId("eardrum-left").boundingBox())!;
  await page.mouse.click(left.x + left.width * 0.6, left.y + left.height * 0.6);
  await tools.getByRole("button", { name: "Pen", exact: true }).click();
  const right = (await page.getByTestId("eardrum-right").boundingBox())!;
  await page.mouse.move(right.x + right.width * 0.3, right.y + right.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(right.x + right.width * 0.45, right.y + right.height * 0.42, { steps: 10 });
  await page.mouse.up();
  await exam.getByRole("button", { name: "Mucopurulent", exact: true }).first().click(); // Discharge, right ear
  // Rinne, Weber and ABC sit under a collapsed Tuning Fork Test heading.
  const tft = exam.getByTestId("exam-group").filter({ hasText: "Tuning Fork Test (TFT)" });
  await expect(tft.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  await expect(exam.getByLabel("Rinne")).toHaveCount(0);
  await tft.getByRole("button").click();
  await expect(exam.getByLabel("Rinne")).toHaveCount(2);
  await expect(exam.getByLabel("Weber")).toBeVisible();
  await expect(exam.getByLabel("ABC")).toHaveCount(2);

  // Audiology section
  await exam.getByRole("button", { name: /Audiology/ }).click();
  for (const [f, db] of [[500, 40], [1000, 45], [2000, 50], [4000, 55]] as const) await exam.getByLabel(`right ac ${f}`).fill(String(db));
  for (const [f, db] of [[500, 10], [1000, 15], [2000, 20]] as const) await exam.getByLabel(`right bc ${f}`).fill(String(db));
  await expect(exam.getByText("PTA 47.5 dB (Moderate) · A-B gap 30 dB")).toBeVisible();

  // Throat and neck pictures: R tonsil congested and an ulcer on the oropharynx; a line drawn on the neck.
  await exam.getByRole("button", { name: /Throat/ }).click();
  const oro = page.getByTestId("sketch-oropharynx");
  await oro.locator('[data-zone="r_tonsil"]').click(); // "Congested" is the first tool
  await page.getByTestId("sketch-tools-oropharynx").getByRole("button", { name: "Mark", exact: true }).click();
  await page.getByTestId("sketch-tools-oropharynx").getByLabel("Mark type").selectOption("ulcer");
  await oro.scrollIntoViewIfNeeded();
  const ob = (await oro.boundingBox())!;
  await page.mouse.click(ob.x + ob.width * 0.6, ob.y + ob.height * (80 / 108));
  await expect(page.getByTestId("sketch-summary-oropharynx")).toHaveText("R tonsil congested; ulcer");
  await exam.getByRole("button", { name: /^Neck/ }).click();
  await page.getByTestId("sketch-tools-neck").getByRole("button", { name: "Pen", exact: true }).click();
  await page.getByTestId("sketch-neck").scrollIntoViewIfNeeded();
  const nb = (await page.getByTestId("sketch-neck").boundingBox())!;
  await page.mouse.move(nb.x + nb.width * 0.3, nb.y + nb.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(nb.x + nb.width * 0.4, nb.y + nb.height * 0.6, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId("sketch-summary-neck")).toHaveText("drawing");

  await addMedicine(page, "candistin", "3 drop tds re 7d");
  await page.waitForTimeout(800); // exam autosave debounce
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/ent-editor.png`, fullPage: true });
  await page.getByTestId("finalize").click();

  const frame = page.frameLocator("[data-testid=print-frame]");
  await expect(frame.locator("section h3", { hasText: "Ear" })).toBeVisible();
  await expect(frame.getByText("R Perforated, L Intact (Normal)")).toBeVisible();
  // "Perforated" with no type yet draws a central perforation; the AI and PI taps add to it.
  await expect(frame.getByText("R: central perforation (medium); perforation AI+PI; drawing · L: grommet")).toBeVisible();
  await expect(frame.locator("figure.diagram", { hasText: "Right TM" }).locator("polyline")).toHaveCount(1);
  await expect(frame.locator("figure.diagram.legend").filter({ hasText: "Grommet" })).toHaveCount(1);
  await expect(frame.getByText("R tonsil congested; ulcer")).toBeVisible();
  await expect(frame.locator("figure.diagram.legend").filter({ hasText: "Congested" })).toContainText("Ulcer");
  await expect(frame.locator("figure.diagram", { hasText: "Neck" }).locator("polyline")).toHaveCount(1);
  await expect(frame.getByText(/R 47.5 dB \(Moderate, A-B gap 30 dB\)/)).toBeVisible();
  // 2 drums + key, oropharynx + key, neck (a drawing alone has no key), audiogram
  await expect(frame.locator(".diagram svg")).toHaveCount(7);
  // Each picture prints under its own findings, not in one block at the end.
  const examSection = (title: RegExp) => frame.locator("section", { has: frame.locator("h3", { hasText: title }) });
  await expect(examSection(/^Ear$/).locator("figcaption", { hasText: /^(Right|Left) TM$/ })).toHaveCount(2);
  await expect(examSection(/^Throat$/).locator("figcaption", { hasText: /^(Oropharynx|Neck)$/ })).toHaveCount(1);
  await expect(examSection(/^Neck$/).locator("figcaption", { hasText: /^Neck$/ })).toHaveCount(1);
  await expect(examSection(/^Audiology$/).locator("figure.diagram")).toHaveCount(1);
  await expect(frame.locator("section.diagrams")).toHaveCount(0);
  await expect(frame.locator(".instr")).toContainText("ডান কানে");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/ent-print.png`, fullPage: true });
});

test("TM answer draws on the TM map; Reset sets both TMs back to normal after confirming", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  await registerPatient(page, { name: `ENT TM ${uniq()}`, age: "35", sex: "Male", mobile: mobile() });
  const exam = page.getByTestId("specialty-exam");
  const tm = exam.getByLabel("TM", { exact: true });
  const right = page.getByTestId("eardrum-right"), left = page.getByTestId("eardrum-left");

  await tm.nth(0).selectOption("Perforated");
  await expect(right.locator('circle[r="12"][fill="#111"]')).toHaveCount(1); // central, medium until sized
  await exam.getByLabel("Perforation", { exact: true }).nth(0).selectOption("Central (subtotal)");
  await expect(right.locator('circle[r="12"]')).toHaveCount(0);
  await expect(right.locator('[data-zone="ai"]')).toHaveAttribute("fill", "#111");
  await tm.nth(0).selectOption("Retracted");
  await expect(right.locator('[data-zone="ai"]')).toHaveAttribute("fill", "url(#hatch)");
  await tm.nth(1).selectOption("Not visible");
  await expect(left.locator('circle[fill="#bbb"]')).toHaveCount(1);

  const reset = page.getByTestId("eardrum-tools").getByRole("button", { name: "Reset", exact: true });
  page.once("dialog", (d) => void d.dismiss());
  await reset.click();
  await expect(right.locator('[data-zone="ai"]')).toHaveAttribute("fill", "url(#hatch)");
  page.once("dialog", (d) => void d.accept());
  await reset.click();
  await expect(right.locator('[data-zone="ai"]')).toHaveAttribute("fill", "#f8fafc");
  await expect(left.locator('circle[fill="#bbb"]')).toHaveCount(0);
  await expect(tm.nth(0)).toHaveValue("Intact (Normal)"); // both TMs back to normal
  await expect(tm.nth(1)).toHaveValue("Intact (Normal)");
  await expect(page.getByRole("button", { name: /^Clear (right|left)$/ })).toHaveCount(0);
  await expect(exam.getByLabel("Perforation", { exact: true }).nth(0)).toHaveValue(""); // Perforation goes back to —
});

test("Throat and neck answers draw on the pictures; Reset clears a picture after confirming", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  await registerPatient(page, { name: `ENT Throat ${uniq()}`, age: "30", sex: "Female", mobile: mobile() });
  const exam = page.getByTestId("specialty-exam");
  await exam.getByRole("button", { name: /Throat/ }).click();
  const oro = page.getByTestId("sketch-oropharynx"), larynx = page.getByTestId("sketch-larynx");

  // Oral cavity takes several findings; Other asks for the doctor's own words.
  const field = (label: string) => exam.locator("span.text-slate-600", { hasText: new RegExp(`^${label}$`) }).locator("xpath=..");
  const chip = (option: string) => field("Oral cavity").getByRole("button", { name: option, exact: true });
  // Ulcer, Mass, Growth and Other each open their own description box when ticked.
  const ulcer = field("Ulcer details").getByRole("textbox"), mass = field("Mass details").getByRole("textbox"), growth = field("Growth details").getByRole("textbox");
  await expect(ulcer).toHaveCount(0);
  await chip("Ulcer").click();
  await ulcer.fill("Aphthous, 3 mm, lower lip");
  await expect(mass).toHaveCount(0);
  await chip("Mass").click();
  await mass.fill("Hard palate, 1 cm");
  await expect(growth).toHaveCount(0);
  await chip("Growth").click();
  await growth.fill("Lateral tongue");
  await expect(chip("Ulcer")).toHaveClass(/bg-brand-50/);
  await expect(ulcer).toHaveValue("Aphthous, 3 mm, lower lip");
  await chip("Growth").click();
  await expect(growth).toHaveCount(0);
  const other = field("Other findings").getByRole("textbox");
  await expect(other).toHaveCount(0);
  await chip("Other").click();
  await other.fill("Leukoplakia on buccal mucosa");
  await expect(other).toHaveValue("Leukoplakia on buccal mucosa");

  await exam.getByLabel("Tonsil (Brodsky)", { exact: true }).nth(0).selectOption("Grade 4");
  await expect(oro.locator('[data-zone="r_tonsil"]')).toHaveAttribute("fill", "#bbb");
  await exam.getByRole("button", { name: "Pus in crypts", exact: true }).click();
  await expect(page.getByTestId("sketch-summary-oropharynx")).toHaveText("R tonsil swollen; pus / exudate");
  await exam.getByLabel("Vocal cords", { exact: true }).selectOption("Right cord palsy");
  await expect(larynx.locator('[data-zone="r_cord"]')).toHaveAttribute("fill", "#bbb");
  await exam.getByLabel("Vocal cords", { exact: true }).selectOption("Left cord palsy");
  await expect(larynx.locator('[data-zone="r_cord"]')).toHaveAttribute("fill", "#fff");
  await expect(larynx.locator('[data-zone="l_cord"]')).toHaveAttribute("fill", "#bbb");
  await exam.getByRole("button", { name: /^Neck/ }).click();
  await exam.getByLabel("Neck", { exact: true }).selectOption("Thyroid swelling");
  await expect(page.getByTestId("sketch-summary-neck")).toHaveText("Thyroid enlarged");

  const reset = page.getByTestId("sketch-tools-oropharynx").getByRole("button", { name: "Reset", exact: true });
  page.once("dialog", (d) => void d.dismiss());
  await reset.click();
  await expect(oro.locator('[data-zone="r_tonsil"]')).toHaveAttribute("fill", "#bbb");
  page.once("dialog", (d) => void d.accept());
  await reset.click();
  await expect(oro.locator('[data-zone="r_tonsil"]')).toHaveAttribute("fill", "#fff");
  await expect(page.getByTestId("sketch-summary-oropharynx")).toHaveCount(0);
  await expect(larynx.locator('[data-zone="l_cord"]')).toHaveAttribute("fill", "#bbb"); // other pictures untouched
});

test("Nose & PNS answers draw on the nose picture; Reset clears it after confirming", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  await registerPatient(page, { name: `ENT Nose ${uniq()}`, age: "26", sex: "Male", mobile: mobile() });
  const exam = page.getByTestId("specialty-exam");
  await exam.getByRole("button", { name: /Nose/ }).click();
  const nose = page.getByTestId("sketch-nose"), summary = page.getByTestId("sketch-summary-nose");
  // A field's chips, by its label (the same option can appear in other fields); right-ear chips come first.
  const field = (label: string) => exam.locator("span.text-slate-600", { hasText: new RegExp(`^${label}$`) }).locator("xpath=..");
  const chip = (label: string, option: string) => field(label).getByRole("button", { name: option, exact: true });

  await chip("Inferior turbinate", "Hypertrophied").nth(0).click();
  await expect(nose.locator('[data-zone="r_it"]')).toHaveAttribute("fill", "#bbb");
  await chip("Septum", "DNS to left").click();
  await exam.getByRole("button", { name: "Maxillary", exact: true }).click();
  await expect(summary).toHaveText("R maxillary sinus tender, L maxillary sinus tender, R inferior turbinate hypertrophied; septum deviated to left");
  // Several septum findings draw together; unticking one takes only its symbol away.
  await chip("Septum", "Spur right").click();
  await expect(summary).toHaveText("R maxillary sinus tender, L maxillary sinus tender, R inferior turbinate hypertrophied; septum deviated to left, spur to right");
  await chip("Septum", "DNS to left").click();
  await expect(summary).toHaveText("R maxillary sinus tender, L maxillary sinus tender, R inferior turbinate hypertrophied; spur to right");
  // Central is the normal septum: it clears the other choices.
  await chip("Septum", "Central").click();
  await expect(summary).toHaveText("R maxillary sinus tender, L maxillary sinus tender, R inferior turbinate hypertrophied");
  await chip("Septum", "Spur right").click();
  await expect(chip("Septum", "Central")).not.toHaveClass(/bg-brand-50/);
  await expect(summary).toHaveText("R maxillary sinus tender, L maxillary sinus tender, R inferior turbinate hypertrophied; spur to right");

  // Nasal cavity: ticking Polyp shows its grades, on that side only; unticking it hides them again.
  const grade = exam.getByLabel("Polyp", { exact: true });
  await expect(grade).toHaveCount(0);
  await chip("Nasal cavity", "Polyp").nth(0).click();
  await expect(grade).toHaveCount(1);
  await grade.selectOption("Present (grade 2)");
  await expect(summary).toContainText("polyp, spur to right");
  await chip("Nasal cavity", "Polyp").nth(0).click();
  await expect(grade).toHaveCount(0);
  await expect(summary).not.toContainText("polyp");
  await chip("Nasal cavity", "Foreign body").nth(1).click();
  await expect(summary).toContainText("foreign body");
  // Nasal mass and Foreign body ask for the doctor's own description, on that side.
  const fb = field("Foreign body").getByRole("textbox");
  await expect(fb).toHaveCount(1);
  await fb.fill("Bead");
  const mass = field("Nasal mass").getByRole("textbox");
  await expect(mass).toHaveCount(0);
  await chip("Nasal cavity", "Nasal mass").nth(1).click();
  await expect(mass).toHaveCount(1);
  await mass.fill("Pedunculated, bleeds on touch");

  const reset = page.getByTestId("sketch-tools-nose").getByRole("button", { name: "Reset", exact: true });
  page.once("dialog", (d) => void d.dismiss());
  await reset.click();
  await expect(summary).toContainText("spur to right");
  page.once("dialog", (d) => void d.accept());
  await reset.click();
  await expect(summary).toHaveCount(0);
  await expect(nose.locator('[data-zone="r_it"]')).toHaveAttribute("fill", "#fff");

  // It prints like the throat pictures: picture plus key.
  await chip("Inferior turbinate", "Pale & boggy").nth(1).click();
  await addMedicine(page, "candistin", "3 drop tds re 7d");
  await page.waitForTimeout(800); // exam autosave debounce
  await page.getByTestId("finalize").click();
  const frame = page.frameLocator("[data-testid=print-frame]");
  await expect(frame.getByText("L inferior turbinate pale / boggy")).toBeVisible();
  await expect(frame.locator("li", { hasText: "Nasal cavity:" })).toHaveText("Nasal cavity: L Foreign body (Bead), Nasal mass (Pedunculated, bleeds on touch)"); // in tick order
  await expect(frame.locator("section", { has: frame.locator("h3", { hasText: /^Nose & PNS$/ }) }).locator("figure.diagram", { hasText: "Nose & sinuses" })).toHaveCount(1);
  await expect(frame.locator("figure.diagram.legend").filter({ hasText: "Pale / boggy" })).toHaveCount(1);
});

test("ENT doctor can always print blank TM maps and throat/neck pictures, to mark by pen", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  const setAlways = async (on: boolean) => {
    await page.goto("/doctor#/settings");
    const boxes = ["tm-map-always", "sketch-always-oropharynx", "sketch-always-larynx", "sketch-always-neck"];
    for (const b of boxes) await page.getByTestId(b).setChecked(on);
    await page.getByTestId("save-print").click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    for (const b of boxes) await expect(page.getByTestId(b)).toBeChecked({ checked: on });
  };
  await setAlways(true);
  try {
    await registerPatient(page, { name: `ENT Blank ${uniq()}`, age: "40", sex: "Male", mobile: mobile() });
    await expect(page.getByTestId("specialty-exam")).toBeVisible();
    await addMedicine(page, "candistin", "3 drop tds re 7d");
    await page.getByTestId("finalize").click();
    const frame = page.frameLocator("[data-testid=print-frame]");
    await expect(frame.locator("figcaption", { hasText: /^(Right|Left) TM$/ })).toHaveCount(2);
    await expect(frame.locator("figcaption", { hasText: /^(Oropharynx|Larynx \(IDL\)|Neck)$/ })).toHaveCount(3);
    await expect(frame.locator("figure.diagram.legend")).toHaveCount(0);
  } finally {
    // Print settings live on the shared demo chamber: don't leak into the other tests.
    await setAlways(false);
    await waitSynced(page);
  }
});

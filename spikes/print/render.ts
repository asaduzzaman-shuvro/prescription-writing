/**
 * Spike: verify Bangla conjunct shaping + pad offsets in Chromium print-to-PDF.
 * Outputs PDFs + PNG previews into spikes/print/out/.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import QRCode from "qrcode";
import {
  BANGLA_CONJUNCT_SAMPLE,
  DEFAULT_PRINT_SETTINGS,
  renderPrescriptionHtml,
  SAMPLE_CHAMBER,
  SAMPLE_DOC,
  SAMPLE_DOCTOR,
  SAMPLE_PATIENT,
  type PrintSettings,
} from "@rx/core";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
mkdirSync(out, { recursive: true });

const fontData = (f: string) =>
  `data:font/ttf;base64,${readFileSync(join(here, "../../assets/fonts", f)).toString("base64")}`;
const fonts = { bengali: fontData("NotoSansBengali.ttf"), latin: fontData("NotoSans.ttf") };

const qrSvg = await QRCode.toString("https://rx.example.bd/v/7f3a9c2e", { type: "svg", margin: 0 });

const variants: { name: string; settings: Partial<PrintSettings> }[] = [
  { name: "letterhead-a4", settings: {} },
  { name: "pad-a5-offset", settings: { mode: "pad", paper: "A5", offsetXmm: 3, offsetYmm: -2, fontSizePt: 9.5 } },
  { name: "letterhead-en", settings: { instructionLang: "en", numerals: "en", genericDisplay: "generic" } },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const v of variants) {
  const settings = { ...DEFAULT_PRINT_SETTINGS, ...v.settings };
  const doc = { ...SAMPLE_DOC, advice: [...SAMPLE_DOC.advice, BANGLA_CONJUNCT_SAMPLE] };
  const html = renderPrescriptionHtml({
    doc,
    patient: SAMPLE_PATIENT,
    doctor: SAMPLE_DOCTOR,
    chamber: SAMPLE_CHAMBER,
    date: "2026-10-05",
    settings,
    qrSvg,
    fonts,
    footerNote: "Verify: rx.example.bd/v/7f3a9c2e",
  });
  writeFileSync(join(out, `${v.name}.html`), html);
  await page.setContent(html, { waitUntil: "load" });
  // Without waiting for fonts, Chromium can print tofu boxes for Bengali glyphs.
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map((f) => `${f.family}:${f.status}`);
  });
  const pdf = join(out, `${v.name}.pdf`);
  await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  console.log(v.name, loaded.join(", "));
}
await browser.close();

import { describe, expect, it } from "vitest";
import { audiogramSvg, eardrumSvg, renderPrescriptionHtml, safeImageDataUrl, sanitizeSvg, DEFAULT_PRINT_SETTINGS, SAMPLE_CHAMBER, SAMPLE_DOC, SAMPLE_DOCTOR, SAMPLE_PATIENT } from "../src";

describe("sanitizeSvg", () => {
  it("strips scripts, event handlers, foreignObject and external refs", () => {
    const evil = `<svg viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><foreignObject><div onclick="x()">hi</div></foreignObject>
      <a href="javascript:alert(3)"><circle cx="5" cy="5" r="4" fill="url(https://evil/x)"/></a><image href="https://evil/p.png"/><path d="M0,0 L1,1" stroke="#000"/></svg>`;
    const out = sanitizeSvg(evil);
    expect(out).not.toMatch(/script|onload|onclick|foreignObject|javascript|evil|<image|<a /i);
    expect(out).toContain('<path d="M0,0 L1,1" stroke="#000"/>');
    expect(out).not.toContain("<circle"); // content of a disallowed element (<a>) is dropped entirely
    expect(out.startsWith('<svg viewBox="0 0 10 10">')).toBe(true);
  });
  it("drops unsafe attribute values on allowed elements", () => {
    expect(sanitizeSvg(`<svg><circle r="4" fill="url(https://evil/x)" style="x" onmouseover="y"/></svg>`)).toBe('<svg><circle r="4"/></svg>');
  });
  it("keeps our own diagrams intact (same-document pattern fill, text)", () => {
    const ear = eardrumSvg({ perforation: ["ai"], retraction: ["ps"] }, "left");
    const clean = sanitizeSvg(ear);
    expect(clean).toContain('fill="url(#hatch)"');
    expect(clean).toContain("scale(-1,1)");
    expect(clean).toContain(">L</text>");
    expect(sanitizeSvg(audiogramSvg({ right: { ac: { 500: 40 }, bc: {} } }))).toContain("<circle");
  });
  it("is applied by the print renderer", () => {
    const html = renderPrescriptionHtml({
      doc: { ...SAMPLE_DOC, diagrams: [{ title: "x", svg: `<svg><script>steal()</script><rect width="1" height="1"/></svg>` }] },
      patient: SAMPLE_PATIENT, doctor: SAMPLE_DOCTOR, chamber: SAMPLE_CHAMBER, date: "2026-10-05",
      settings: DEFAULT_PRINT_SETTINGS, fonts: { bengali: "", latin: "" }, signatureDataUrl: `javascript:alert(1)`,
    });
    expect(html).not.toContain("steal()");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('<rect width="1" height="1"/>');
  });
  it("only accepts raster data URLs for signatures", () => {
    expect(safeImageDataUrl("data:image/png;base64,iVBORw0KGgo=")).toBeDefined();
    expect(safeImageDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBeUndefined();
    expect(safeImageDataUrl("https://evil/x.png")).toBeUndefined();
  });
});

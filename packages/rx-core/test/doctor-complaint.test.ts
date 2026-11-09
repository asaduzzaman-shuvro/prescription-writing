import { describe, expect, it } from "vitest";
import { doctorComplaintOverrideId, doctorComplaintProblem } from "../src/doctor-complaint";
import { labRowId } from "../src/lab-tests";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const USER = "6a1d5a52-7c8e-4f0b-a0a4-5d5c6a7c8e90";
const COMPLAINT = "0b6f3c1e-9a43-4a5e-8f43-2f1f6f0f7c11";

describe("doctorComplaintProblem", () => {
  it("accepts a line, with or without Bangla", () => {
    expect(doctorComplaintProblem({ name: "Fever for 3 days" })).toBeNull();
    expect(doctorComplaintProblem({ name: "Fever for 3 days", name_bn: "জ্বর ৩ দিন" })).toBeNull();
    expect(doctorComplaintProblem({ name: "Ear discharge for 7 days", name_bn: null })).toBeNull();
  });

  it("requires the line", () => {
    expect(doctorComplaintProblem({})).toBe("complaint is required");
    expect(doctorComplaintProblem({ name: "   " })).toBe("complaint is required");
    expect(doctorComplaintProblem({ name: 5 })).toBe("complaint is required");
  });

  it("rejects over-long or non-text values", () => {
    expect(doctorComplaintProblem({ name: "x".repeat(121) })).toBe("complaint is too long (max 120)");
    expect(doctorComplaintProblem({ name: "Fever", name_bn: "x".repeat(121) })).toBe("Bangla complaint is too long (max 120)");
    expect(doctorComplaintProblem({ name: "Fever", name_bn: 3 })).toBe("Bangla complaint must be text");
  });
});

describe("doctorComplaintOverrideId", () => {
  it("is a stable uuid per doctor and shared line", () => {
    const id = doctorComplaintOverrideId(USER, COMPLAINT);
    expect(id).toMatch(UUID);
    expect(doctorComplaintOverrideId(USER, COMPLAINT)).toBe(id);
    expect(doctorComplaintOverrideId(COMPLAINT, USER)).not.toBe(id);
  });

  it("leaves lab row ids unchanged", () => {
    // Pinned from before derivedUuid was split out: existing clinic rows on devices use these ids.
    expect(labRowId(USER, "lab_test", "cbc")).toBe("3fd619da-3a02-8764-921c-dd7fdd49a876");
  });
});

import { describe, expect, it } from "vitest";
import { complaintDuration, formatComplaintDuration, stripComplaintDuration, withComplaintDuration } from "../src/complaint-duration";

describe("withComplaintDuration", () => {
  it("adds a duration after the complaint, with a dash", () => {
    expect(withComplaintDuration("Ear discharge", 7, "day")).toBe("Ear discharge - 7 days");
    expect(withComplaintDuration("Ear discharge (R)", 2, "month")).toBe("Ear discharge (R) - 2 months");
    expect(withComplaintDuration("Cough", 1, "week")).toBe("Cough - 1 week");
  });

  it("replaces the duration it had instead of adding a second one, whichever way it was written", () => {
    expect(withComplaintDuration("Hearing loss - 3 days", 4, "day")).toBe("Hearing loss - 4 days");
    expect(withComplaintDuration("Hearing loss × 3 days", 4, "day")).toBe("Hearing loss - 4 days");
    expect(withComplaintDuration("Fever for 7 days", 2, "week")).toBe("Fever - 2 weeks");
    expect(withComplaintDuration("Fever 5d", 1, "month")).toBe("Fever - 1 month");
    expect(withComplaintDuration("Fever x 10 days", 3, "day")).toBe("Fever - 3 days");
    expect(withComplaintDuration("Post-nasal drip", 3, "day")).toBe("Post-nasal drip - 3 days");
  });

  it("writes Bangla durations on a Bangla line", () => {
    expect(withComplaintDuration("কানে কম শোনা", 3, "day")).toBe("কানে কম শোনা - ৩ দিন");
    expect(withComplaintDuration("জ্বর - ৩ দিন", 12, "day")).toBe("জ্বর - ১২ দিন");
    expect(withComplaintDuration("কাশি", 2, "week")).toBe("কাশি - ২ সপ্তাহ");
  });

  it("drops the duration for zero or nonsense", () => {
    expect(withComplaintDuration("Fever - 3 days", 0, "day")).toBe("Fever");
    expect(withComplaintDuration("Fever", Number.NaN, "day")).toBe("Fever");
  });
});

describe("stripComplaintDuration / complaintDuration", () => {
  it("reads and removes a trailing duration", () => {
    expect(stripComplaintDuration("Hearing loss - 3 days")).toBe("Hearing loss");
    expect(complaintDuration("Hearing loss - 3 days")).toBe("3 days");
    expect(complaintDuration("Hearing loss × 3 days")).toBe("3 days");
    expect(complaintDuration("জ্বর ও গলা ব্যথা ৩ দিন")).toBe("৩ দিন");
    expect(complaintDuration("Hearing loss (R)")).toBeNull();
  });

  it("leaves lines that are only a number, or have no duration, alone", () => {
    expect(stripComplaintDuration("3 days")).toBe("3 days");
    expect(complaintDuration("3 days")).toBeNull();
    expect(stripComplaintDuration("Pain in 2 joints")).toBe("Pain in 2 joints");
    expect(stripComplaintDuration("Hearing loss")).toBe("Hearing loss");
  });
});

describe("formatComplaintDuration", () => {
  it("is singular for one", () => {
    expect(formatComplaintDuration(1, "day")).toBe("1 day");
    expect(formatComplaintDuration(1, "year", true)).toBe("১ বছর");
  });
});

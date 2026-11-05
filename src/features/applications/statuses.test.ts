import { describe, expect, it } from "vitest";
import { APPLICATION_STATUSES, countByStatus, normalizeStatus } from "./statuses";
import { applications as demoApps } from "@/demo/sampleData";

describe("application statuses", () => {
  it("every form option maps to itself, i.e. a board column", () => {
    for (const s of APPLICATION_STATUSES) expect(normalizeStatus(s)).toBe(s);
  });
  it("maps legacy values", () => {
    expect(normalizeStatus("Bookmarked")).toBe("Saved");
    expect(normalizeStatus("Interview")).toBe("Interviewing");
    expect(normalizeStatus("Accepted")).toBe("Offer");
    expect(normalizeStatus(" applied ")).toBe("Applied");
    expect(normalizeStatus("weird")).toBe("Applied");
    expect(normalizeStatus(null)).toBe("Applied");
  });
  it("counts by new statuses in order, including zeros", () => {
    const r = countByStatus([{ status: "Applied" }, { status: "Interview" }, { status: "Accepted" }, { status: "Bookmarked" }]);
    expect(r.map((x) => x.status)).toEqual([...APPLICATION_STATUSES]);
    expect(Object.fromEntries(r.map((x) => [x.status, x.count]))).toEqual({
      Networking: 0, Saved: 1, Applied: 1, Interviewing: 1, Offer: 1, Rejected: 0,
    });
  });
  it("demo shows all 7 applications on the board", () => {
    const total = countByStatus(demoApps).reduce((n, x) => n + x.count, 0);
    expect(total).toBe(7);
  });
});

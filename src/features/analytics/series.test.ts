import { describe, expect, it } from "vitest";
import { buildContactsSeries, topCompanies } from "./series";

const today = new Date(2026, 10, 6, 15, 0); // 6 Nov 2026 local
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

describe("buildContactsSeries", () => {
  it("covers 30 local days ending today, one point per day", () => {
    const s = buildContactsSeries(
      [{ created_at: at(2026, 11, 6) }, { created_at: at(2026, 9, 27) }],
      today,
    );
    expect(s).toHaveLength(30);
    expect(s[29].date).toBe("2026-11-06");
    expect(s[0].date).toBe("2026-10-08");
  });

  it("shows gaps as flat days and counts pre-window contacts in the baseline", () => {
    const s = buildContactsSeries(
      [{ created_at: at(2026, 9, 27) }, { created_at: at(2026, 10, 10) }, { created_at: at(2026, 11, 6) }],
      today,
    );
    expect(s[0].cumulative).toBe(1);
    expect(s.find((p) => p.date === "2026-10-10")).toMatchObject({ added: 1, cumulative: 2 });
    expect(s.find((p) => p.date === "2026-10-20")).toMatchObject({ added: 0, cumulative: 2 });
    expect(s[29]).toMatchObject({ added: 1, cumulative: 3 });
  });

  it("buckets by local day, not UTC", () => {
    const s = buildContactsSeries([{ created_at: at(2026, 11, 5, 23) }], today);
    expect(s.find((p) => p.date === "2026-11-05")?.added).toBe(1);
  });

  it("skips null and invalid created_at", () => {
    const s = buildContactsSeries(
      [{ created_at: null }, { created_at: undefined }, { created_at: "nope" }, { created_at: at(2026, 11, 6) }],
      today,
    );
    expect(s[29].cumulative).toBe(1);
  });

  it("handles empty input", () => {
    const s = buildContactsSeries([], today);
    expect(s).toHaveLength(30);
    expect(s.every((p) => p.cumulative === 0 && p.added === 0)).toBe(true);
  });
});

describe("topCompanies", () => {
  it("orders by count desc then name asc, stable regardless of input order", () => {
    const a = [{ company: "Zed" }, { company: "Acme" }, { company: "Acme" }, { company: "Beta" }, { company: "Zed" }, { company: "Cog" }];
    const expected = [
      { company: "Acme", count: 2 },
      { company: "Zed", count: 2 },
      { company: "Beta", count: 1 },
      { company: "Cog", count: 1 },
    ];
    expect(topCompanies(a)).toEqual(expected);
    expect(topCompanies([...a].reverse())).toEqual(expected);
  });

  it("limits to 10 and handles empty", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ company: `C${String(i).padStart(2, "0")}` }));
    expect(topCompanies(many)).toHaveLength(10);
    expect(topCompanies([])).toEqual([]);
  });
});

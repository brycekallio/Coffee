import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A grid with no explicit column count has one implicit `auto` column, and `auto`
 * grows to fit the widest unbreakable content inside it. On a phone that pushes the
 * whole page sideways (the Watchlist at 390px was 415px wide). `grid-cols-1` makes the
 * column `minmax(0, 1fr)`, which can shrink. So any page grid that only declares its
 * columns at `lg:` must also say `grid-cols-1` for the phone layout.
 */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? tsxFiles(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("responsive grids", () => {
  it("never leave the phone layout on an implicit auto column", () => {
    const bad: string[] = [];
    for (const file of tsxFiles("src")) {
      for (const m of readFileSync(file, "utf8").matchAll(/className="([^"]*\bgrid\b[^"]*\blg:grid-cols-\d[^"]*)"/g)) {
        const cls = m[1].split(/\s+/);
        if (cls.includes("lg:grid")) continue; // grid only applies at lg, so phones are not a grid
        if (!cls.some((c) => c.startsWith("grid-cols-"))) bad.push(`${file}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

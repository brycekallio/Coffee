import { describe, expect, it } from "vitest";
import { MAX_TAGS_PER_ROW, MAX_TAG_LENGTH, allTags, nextStarValue, normalizeTag, planTagChange, starredFirst, tagState, withTag } from "./tags";

describe("normalizeTag", () => {
  it("trims, collapses spaces, drops commas, caps the length", () => {
    expect(normalizeTag("  case   prep ")).toBe("case prep");
    expect(normalizeTag("a,b")).toBe("a b");
    expect(normalizeTag("   ")).toBe("");
    expect(normalizeTag("x".repeat(60))).toHaveLength(MAX_TAG_LENGTH);
  });
});

describe("withTag", () => {
  it("adds once, case-insensitively", () => {
    expect(withTag(["Banking"], "banking", "add")).toEqual(["Banking"]);
    expect(withTag(["Banking"], "Consulting", "add")).toEqual(["Banking", "Consulting"]);
  });
  it("removes case-insensitively", () => {
    expect(withTag(["Banking", "Consulting"], "BANKING", "remove")).toEqual(["Consulting"]);
  });
  it("stops at the per-row cap (the database enforces the same)", () => {
    const full = Array.from({ length: MAX_TAGS_PER_ROW }, (_, i) => `t${i}`);
    expect(withTag(full, "extra", "add")).toEqual(full);
  });
});

describe("planTagChange", () => {
  const rows = [
    { id: "1", tags: [] },
    { id: "2", tags: [] },
    { id: "3", tags: ["Banking"] },
    { id: "4", tags: ["Consulting"] },
  ];
  it("groups rows that end with the same tags into one update", () => {
    const plan = planTagChange(rows, "Banking", "add");
    expect(plan).toHaveLength(2); // [] -> [Banking] for 1,2 ; [Consulting] -> [Consulting, Banking] for 4
    expect(plan.find((g) => g.tags.join() === "Banking")?.ids).toEqual(["1", "2"]);
    expect(plan.find((g) => g.tags.join() === "Consulting,Banking")?.ids).toEqual(["4"]);
  });
  it("leaves out rows the change would not alter", () => {
    expect(planTagChange(rows, "Banking", "remove").flatMap((g) => g.ids)).toEqual(["3"]);
    expect(planTagChange([{ id: "3", tags: ["Banking"] }], "banking", "add")).toEqual([]);
  });
});

describe("tag menu helpers", () => {
  it("tagState says whether none, some or all of the rows carry a tag", () => {
    const rows = [{ tags: ["a"] }, { tags: [] }];
    expect(tagState(rows, "a")).toBe("some");
    expect(tagState(rows, "b")).toBe("none");
    expect(tagState([{ tags: ["a"] }], "A")).toBe("all");
  });
  it("allTags is distinct, case-insensitive and sorted", () => {
    expect(allTags([{ tags: ["b", "A"] }, { tags: ["a", "c"] }])).toEqual(["A", "b", "c"]);
  });
});

describe("starring", () => {
  it("starredFirst floats starred rows and keeps the rest in order", () => {
    const rows = [
      { id: "1", starred: false },
      { id: "2", starred: true },
      { id: "3", starred: false },
      { id: "4", starred: true },
    ];
    expect(starredFirst(rows).map((r) => r.id)).toEqual(["2", "4", "1", "3"]);
  });
  it("nextStarValue stars unless everything is starred already", () => {
    expect(nextStarValue([{ starred: true }, { starred: false }])).toBe(true);
    expect(nextStarValue([{ starred: true }, { starred: true }])).toBe(false);
    expect(nextStarValue([{ starred: false }])).toBe(true);
  });
});

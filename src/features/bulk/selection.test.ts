import { describe, expect, it } from "vitest";
import { EMPTY, allState, applyClick, prune, setRange, toggle, toggleAll } from "./selection";

const order = ["a", "b", "c", "d", "e"];
const sel = (...ids: string[]) => new Set(ids);

describe("toggle", () => {
  it("adds, then removes, without mutating the input", () => {
    const one = toggle(EMPTY, "a");
    expect([...one]).toEqual(["a"]);
    expect(EMPTY.size).toBe(0);
    expect(toggle(one, "a").size).toBe(0);
  });
});

describe("setRange (shift-click)", () => {
  it("selects everything between the anchor and the target, either direction", () => {
    expect([...setRange(order, EMPTY, "b", "d", true)].sort()).toEqual(["b", "c", "d"]);
    expect([...setRange(order, EMPTY, "d", "b", true)].sort()).toEqual(["b", "c", "d"]);
  });
  it("keeps what was already selected outside the range", () => {
    expect([...setRange(order, sel("a"), "c", "d", true)].sort()).toEqual(["a", "c", "d"]);
  });
  it("shift-unticking clears the range", () => {
    expect([...setRange(order, sel("a", "b", "c", "d"), "b", "d", false)]).toEqual(["a"]);
  });
  it("with no anchor, or an anchor that left the list, acts on the target alone", () => {
    expect([...setRange(order, EMPTY, null, "c", true)]).toEqual(["c"]);
    expect([...setRange(order, EMPTY, "gone", "c", true)]).toEqual(["c"]);
  });
  it("ignores a target that is not in the list", () => {
    expect(setRange(order, sel("a"), "a", "zzz", true).size).toBe(1);
  });
});

describe("select all", () => {
  it("reports none / some / all", () => {
    expect(allState(order, EMPTY)).toBe("none");
    expect(allState(order, sel("a"))).toBe("some");
    expect(allState(order, new Set(order))).toBe("all");
    expect(allState([], EMPTY)).toBe("none");
  });
  it("selects every shown row, and clears when they are all selected", () => {
    expect(toggleAll(order, sel("a")).size).toBe(5);
    expect(toggleAll(order, new Set(order)).size).toBe(0);
  });
  it("only ever covers the rows shown (e.g. after a search)", () => {
    expect([...toggleAll(["b", "c"], EMPTY)].sort()).toEqual(["b", "c"]);
  });
});

describe("prune", () => {
  it("drops rows that are no longer shown, so a bulk action cannot reach them", () => {
    expect([...prune(sel("a", "x"), order)]).toEqual(["a"]);
  });
  it("returns the same Set when nothing changed", () => {
    const s = sel("a", "b");
    expect(prune(s, order)).toBe(s);
  });
});

describe("applyClick", () => {
  it("plain click flips one row; shift-click after it selects the whole stretch", () => {
    const first = applyClick(order, EMPTY, null, "b", false);
    expect([...first]).toEqual(["b"]);
    const ranged = applyClick(order, first, "b", "e", true);
    expect([...ranged].sort()).toEqual(["b", "c", "d", "e"]);
  });
  it("shift-clicking a selected row unselects the stretch back to the anchor", () => {
    const all = new Set(order);
    expect([...applyClick(order, all, "a", "c", true)].sort()).toEqual(["d", "e"]);
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_FREE_MODEL, resolveFreeModel } from "./llm.ts";

describe("resolveFreeModel", () => {
  it("uses the FREE_AI_MODEL override when set", () => {
    expect(resolveFreeModel(" acme/model:free ")).toBe("acme/model:free");
  });
  it("falls back to the built-in default when unset or blank", () => {
    expect(resolveFreeModel(undefined)).toBe(DEFAULT_FREE_MODEL);
    expect(resolveFreeModel("  ")).toBe(DEFAULT_FREE_MODEL);
  });
});

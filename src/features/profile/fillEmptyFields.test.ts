import { describe, expect, it } from "vitest";
import { fillEmptyFields } from "./fillEmptyFields";

const blank = { full_name: null, phone: null, my_linkedin_url: null, career_interests: null };

describe("fillEmptyFields", () => {
  it("seeds the name from Clerk for a brand-new, blank profile", () => {
    expect(fillEmptyFields(blank, {}, "Ada Lovelace")).toEqual({ full_name: "Ada Lovelace" });
  });

  it("never overwrites a name the user already set (the old rename-reverting bug)", () => {
    expect(fillEmptyFields({ ...blank, full_name: "Ada" }, {}, "Ada Lovelace")).toEqual({});
  });

  it("prefers a password-era pending name over Clerk's", () => {
    expect(fillEmptyFields(blank, { full_name: "Countess Ada" }, "Ada Lovelace")).toEqual({ full_name: "Countess Ada" });
  });

  it("fills only the pending fields that are still empty", () => {
    const row = { ...blank, phone: "303-555-0101" };
    expect(fillEmptyFields(row, { phone: "999", my_linkedin_url: "in/ada" }, undefined)).toEqual({
      my_linkedin_url: "in/ada",
    });
  });

  it("treats a whitespace-only field as empty", () => {
    expect(fillEmptyFields({ ...blank, full_name: "  " }, {}, "Ada")).toEqual({ full_name: "Ada" });
  });

  it("fills everything when there is no row yet", () => {
    expect(fillEmptyFields(null, { phone: "1" }, "Ada")).toEqual({ full_name: "Ada", phone: "1" });
  });
});

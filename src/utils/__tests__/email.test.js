import { describe, expect, it } from "vitest";
import { decodeEmailKey, normalizeEmailValue } from "../email";

describe("normalizeEmailValue", () => {
  it("trims spaces and lowercases", () => {
    expect(normalizeEmailValue("  Test@Example.COM  ")).toBe("test@example.com");
  });

  it("returns empty string for empty-like values", () => {
    expect(normalizeEmailValue("   ")).toBe("");
    expect(normalizeEmailValue(null)).toBe("");
    expect(normalizeEmailValue(undefined)).toBe("");
  });

  it("stringifies non-string values", () => {
    expect(normalizeEmailValue(123)).toBe("123");
  });
});

describe("decodeEmailKey", () => {
  it("replaces commas with dots", () => {
    expect(decodeEmailKey("user,example,com")).toBe("user.example.com");
  });

  it("handles surrounding spaces", () => {
    expect(decodeEmailKey("  user,name@example,com  ")).toBe("user.name@example.com");
  });
});

import { describe, expect, it } from "vitest";
import {
  getListItemsCount,
  isFamilyListName,
  normalizeListEntry,
  shouldPreferFamilyEntry,
} from "../lists";

describe("isFamilyListName", () => {
  it("matches family list name case-insensitively", () => {
    expect(isFamilyListName("  СЕМЕЙНЫЙ СПИСОК ")).toBe(true);
    expect(isFamilyListName("Рабочий список")).toBe(false);
  });
});

describe("getListItemsCount", () => {
  it("counts arrays and object records", () => {
    expect(getListItemsCount({ items: [{ id: 1 }, { id: 2 }] })).toBe(2);
    expect(getListItemsCount({ items: { a: {}, b: {}, c: {} } })).toBe(3);
    expect(getListItemsCount({ items: null })).toBe(0);
  });
});

describe("shouldPreferFamilyEntry", () => {
  it("prefers active list candidate", () => {
    const existing = { id: "a", items: {}, members: [] };
    const candidate = { id: "b", items: {}, members: [] };

    expect(shouldPreferFamilyEntry(existing, candidate, "b")).toBe(true);
  });

  it("falls back to item/member count", () => {
    const existing = { id: "a", items: { x: {} }, members: ["a@a.com"] };
    const candidate = {
      id: "b",
      items: { x: {}, y: {} },
      members: ["a@a.com", "b@b.com"],
    };

    expect(shouldPreferFamilyEntry(existing, candidate, null)).toBe(true);
  });
});

describe("normalizeListEntry", () => {
  it("normalizes id/name/items and adds current user into members", () => {
    const result = normalizeListEntry(
      "list-1",
      {
        name: "",
        members: ["  USER@example.com  ", "user@example.com"],
        items: null,
      },
      { email: "me@example.com" }
    );

    expect(result.id).toBe("list-1");
    expect(result.name).toBe("Без названия");
    expect(result.items).toEqual({});
    expect(result.members).toEqual(["USER@example.com", "me@example.com"]);
  });
});

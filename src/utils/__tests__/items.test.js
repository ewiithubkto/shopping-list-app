import { describe, expect, it } from "vitest";
import { itemsArrayToRecord, normalizeItem } from "../items";

describe("normalizeItem", () => {
  it("uses fallbackId when id is absent", () => {
    const result = normalizeItem({ name: "Milk" }, "fallback-id");

    expect(result.id).toBe("fallback-id");
  });

  it("applies defaults for category and flags", () => {
    const result = normalizeItem({ id: 1, name: "Milk" });

    expect(result.category).toBe("Другое");
    expect(result.active).toBe(true);
    expect(result.bought).toBe(false);
  });
});

describe("itemsArrayToRecord", () => {
  it("builds record keyed by id", () => {
    const result = itemsArrayToRecord([
      { id: "a", name: "Milk", active: true, bought: false, category: "Dairy" },
      { id: "b", name: "Bread", active: false, bought: true, category: "Bakery" },
    ]);

    expect(Object.keys(result)).toEqual(["a", "b"]);
    expect(result.a.name).toBe("Milk");
    expect(result.b.name).toBe("Bread");
  });

  it("overwrites duplicates by last id occurrence", () => {
    const result = itemsArrayToRecord([
      { id: "a", name: "Milk" },
      { id: "a", name: "Bread" },
    ]);

    expect(result.a.name).toBe("Bread");
  });
});

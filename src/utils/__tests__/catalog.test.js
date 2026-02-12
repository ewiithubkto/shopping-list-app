import { describe, expect, it } from "vitest";
import { dedupeCatalog, normalizeCatalogItem } from "../catalog";
import { normalizeName } from "../items";

describe("normalizeCatalogItem", () => {
  it("trims name and returns null for empty name", () => {
    expect(
      normalizeCatalogItem({ name: "  Milk  ", category: "Dairy" }, "Other")
    ).toEqual({ name: "Milk", category: "Dairy" });

    expect(normalizeCatalogItem({ name: "   " }, "Other")).toBeNull();
  });

  it("applies default category", () => {
    expect(normalizeCatalogItem({ name: "Milk" }, "Other")).toEqual({
      name: "Milk",
      category: "Other",
    });
  });
});

describe("dedupeCatalog", () => {
  it("dedupes by normalized name", () => {
    const result = dedupeCatalog(
      [
        { name: "  Milk ", category: "Dairy" },
        { name: "milk", category: "Another" },
      ],
      { normalizeName, defaultCategory: "Other" }
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ name: "Milk", category: "Dairy" });
  });

  it("keeps the category from first unique entry", () => {
    const result = dedupeCatalog(
      [
        { name: "Bread", category: "Bakery" },
        { name: " BREAD ", category: "Other" },
      ],
      { normalizeName, defaultCategory: "Fallback" }
    );

    expect(result).toEqual([{ name: "Bread", category: "Bakery" }]);
  });
});

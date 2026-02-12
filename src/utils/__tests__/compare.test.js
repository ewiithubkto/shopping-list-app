import { describe, expect, it } from "vitest";
import {
  areCatalogCollectionsEqual,
  areItemsCollectionsEqual,
} from "../compare";

const baseItem = {
  id: 1,
  name: "Milk",
  category: "Dairy",
  active: true,
  bought: false,
};

describe("areItemsCollectionsEqual", () => {
  it("returns true for same items in different order", () => {
    const first = [
      baseItem,
      { id: 2, name: "Bread", category: "Bakery", active: false, bought: true },
    ];
    const second = [first[1], first[0]];

    expect(areItemsCollectionsEqual(first, second)).toBe(true);
  });

  it("returns false when one relevant field differs", () => {
    expect(
      areItemsCollectionsEqual([baseItem], [{ ...baseItem, bought: true }])
    ).toBe(false);
    expect(
      areItemsCollectionsEqual([baseItem], [{ ...baseItem, active: false }])
    ).toBe(false);
    expect(
      areItemsCollectionsEqual([baseItem], [{ ...baseItem, category: "Other" }])
    ).toBe(false);
    expect(
      areItemsCollectionsEqual([baseItem], [{ ...baseItem, name: "MILK" }])
    ).toBe(false);
    expect(
      areItemsCollectionsEqual([baseItem], [{ ...baseItem, id: 99 }])
    ).toBe(false);
  });

  it("treats different id types as different", () => {
    expect(
      areItemsCollectionsEqual(
        [{ ...baseItem, id: 1 }],
        [{ ...baseItem, id: "1" }]
      )
    ).toBe(false);
  });
});

describe("areCatalogCollectionsEqual", () => {
  it("returns true for same entries in different order", () => {
    const first = [
      { name: "Milk", category: "Dairy" },
      { name: "Bread", category: "Bakery" },
    ];
    const second = [first[1], first[0]];

    expect(areCatalogCollectionsEqual(first, second)).toBe(true);
  });

  it("returns false when name or category differs", () => {
    expect(
      areCatalogCollectionsEqual(
        [{ name: "Milk", category: "Dairy" }],
        [{ name: "MILK", category: "Dairy" }]
      )
    ).toBe(false);

    expect(
      areCatalogCollectionsEqual(
        [{ name: "Milk", category: "Dairy" }],
        [{ name: "Milk", category: "Other" }]
      )
    ).toBe(false);
  });
});

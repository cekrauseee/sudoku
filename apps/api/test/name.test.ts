import { describe, expect, it } from "vitest";

import { NAME_MAX_LENGTH, truncateName } from "../src/modules/profile/name.ts";

describe("truncateName", () => {
  it("normalizes whitespace", () => {
    expect(truncateName("  Ana   Clara ")).toBe("Ana Clara");
  });

  it("counts characters rather than UTF-16 code units", () => {
    expect(truncateName("😀".repeat(NAME_MAX_LENGTH + 1))).toBe(
      "😀".repeat(NAME_MAX_LENGTH),
    );
  });

  it("does not leave trailing whitespace after shortening", () => {
    expect(truncateName(`${"a".repeat(NAME_MAX_LENGTH - 1)} b`)).toBe(
      "a".repeat(NAME_MAX_LENGTH - 1),
    );
  });
});

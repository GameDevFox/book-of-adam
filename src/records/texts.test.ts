import { describe, expect, it } from "vitest";

import { firstPage } from "./texts";

describe("firstPage", () => {
  it("takes the opening page of a printed range", () => {
    expect(firstPage("60-65")).toBe("60");
    expect(firstPage("1-6")).toBe("1");
  });

  it("passes a single page through", () => {
    expect(firstPage("123")).toBe("123");
  });
});

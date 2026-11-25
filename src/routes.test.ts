import { matchRoutes } from "react-router";
import { describe, expect, it } from "vitest";

import { NotFound, ROUTES } from "./routes";

/** The leaf a path lands on: its route's Component, or "index" for the `/` redirect. */
const leaf = (pathname: string) => {
  const matches = matchRoutes(ROUTES, pathname) ?? [];
  const last = matches[matches.length - 1]?.route;
  return last?.index ? "index" : last?.Component;
};

describe("routes", () => {
  it("sends unknown paths to NotFound, not an empty shell", () => {
    expect(leaf("/nope")).toBe(NotFound);
    expect(leaf("/nope/deeper")).toBe(NotFound);
    expect(leaf("/library-x")).toBe(NotFound);
  });

  it("still routes the root and every sub-app, including its sub-paths", () => {
    expect(leaf("/")).toBe("index");
    expect(leaf("/library")).not.toBe(NotFound);
    expect(leaf("/library/kjv/genesis/1")).not.toBe(NotFound);
    expect(leaf("/deseret")).not.toBe(NotFound);
  });
});

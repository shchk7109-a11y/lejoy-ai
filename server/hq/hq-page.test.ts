import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("HQ web portal isolation", () => {
  it("uses dedicated HQ API and never persists raw codes in browser storage", () => {
    const source = readFileSync(new URL("../../client/src/pages/Hq.tsx", import.meta.url), "utf8");
    expect(source).toContain("/api/hq/auth/login");
    expect(source).toContain("/api/hq/batches");
    expect(source).toContain("credentials: \"include\"");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("trpc.admin");
  });
});

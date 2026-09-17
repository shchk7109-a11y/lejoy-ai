import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseHqAdminCommand } from "../../scripts/hq-admin";

describe("HQ bootstrap command", () => {
  it("only accepts account identifiers, never secret-bearing arguments", () => {
    expect(parseHqAdminCommand(["create", "head-office"])).toEqual({ action: "create", username: "head-office" });
    expect(parseHqAdminCommand(["reset-totp", "head-office"])).toEqual({ action: "reset-totp", username: "head-office" });
    for (const argv of [
      ["create", "head-office", "password"],
      ["create", "head-office", "--password=secret"],
      ["reset-totp", "head-office", "--secret=abc"],
      ["create", "bad user"],
    ]) expect(() => parseHqAdminCommand(argv)).toThrow();
  });
  it("uses the existing terminal for prompts without sharing a manually closed stream fd", () => {
    const source = readFileSync(new URL("../../scripts/hq-admin.ts", import.meta.url), "utf8");
    expect(source).toContain("process.stdin.isTTY");
    expect(source).toContain("input: process.stdin");
    expect(source).not.toContain("createReadStream");
    expect(source).toContain("process.exit(exitCode)");
  });
});

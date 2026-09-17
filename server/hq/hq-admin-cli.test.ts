import { describe, expect, it } from "vitest";
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
});

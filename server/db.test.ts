import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => {
  const insertOnDuplicateKeyUpdate = vi.fn().mockResolvedValue(undefined);
  const insertValues = vi.fn(() => ({
    onDuplicateKeyUpdate: insertOnDuplicateKeyUpdate,
  }));
  const insert = vi.fn(() => ({ values: insertValues }));

  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const selectLimit = vi.fn().mockResolvedValue([]);
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));

  const fakeDb = { insert, update, select };

  function reset() {
    insertOnDuplicateKeyUpdate.mockClear();
    insertValues.mockClear();
    insert.mockClear();
    updateWhere.mockClear();
    updateSet.mockClear();
    update.mockClear();
    selectLimit.mockClear();
    selectLimit.mockResolvedValue([]);
    selectWhere.mockClear();
    selectFrom.mockClear();
    select.mockClear();
  }

  return {
    fakeDb,
    insertOnDuplicateKeyUpdate,
    insertValues,
    updateSet,
    selectLimit,
    reset,
  };
});

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: vi.fn(() => dbMock.fakeDb),
}));

describe("db api key persistence guards", () => {
  beforeEach(() => {
    vi.resetModules();
    dbMock.reset();
    process.env.DATABASE_URL = "mysql://unit-test";
  });

  it("upsertModelConfig omits apiKey from duplicate update set when key is blank", async () => {
    const db = await import("./db");

    await db.upsertModelConfig({
      configKey: "tts",
      label: "TTS",
      provider: "minimax",
      modelName: "speech-02",
      baseUrl: "https://tts.example.com/v1",
    });

    const duplicateUpdateArg = dbMock.insertOnDuplicateKeyUpdate.mock.calls[0]?.[0];
    expect(duplicateUpdateArg).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(duplicateUpdateArg.set, "apiKey")).toBe(false);
  });

  it("upsertUserApiConfig omits apiKey from update set when updating existing config without new key", async () => {
    dbMock.selectLimit.mockResolvedValue([{ id: 123, userId: 7, configKey: "tts" }]);
    const db = await import("./db");

    await db.upsertUserApiConfig(7, "tts", {
      modelName: "speech-02",
      baseUrl: "https://tts.example.com/v1",
    });

    const updateSetArg = dbMock.updateSet.mock.calls[0]?.[0];
    expect(updateSetArg).toBeDefined();
    expect(updateSetArg).toEqual({
      modelName: "speech-02",
      baseUrl: "https://tts.example.com/v1",
    });
    expect(Object.prototype.hasOwnProperty.call(updateSetArg, "apiKey")).toBe(false);
  });
});

import { describe, expect, it, vi } from "vitest";
import { deleteFromManus, deleteFromS3 } from "./storage";

describe("storageDelete 驱动", () => {
  it("S3 驱动发送 DeleteObjectCommand", async () => {
    const send = vi.fn(async () => undefined);

    await deleteFromS3({ send } as never, "lejoy-bucket", "/results/7/a.png");

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0].input).toEqual({ Bucket: "lejoy-bucket", Key: "results/7/a.png" });
  });

  it("Manus 驱动调用带鉴权的删除端点", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

    await deleteFromManus("https://forge.example/api/", "forge-key", "/uploads/7/a.jpg", request);

    expect(String(request.mock.calls[0][0])).toBe("https://forge.example/api/v1/storage/delete?path=uploads%2F7%2Fa.jpg");
    expect(request.mock.calls[0][1]).toMatchObject({
      method: "DELETE",
      headers: { Authorization: "Bearer forge-key" },
    });
  });
});

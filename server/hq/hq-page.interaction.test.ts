// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Hq from "../../client/src/pages/Hq";

let root: Root;
let host: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
async function render() {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(createElement(Hq)); await Promise.resolve(); });
}
function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")!.set!;
  setter.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "/api/hq/auth/me") return json({ username: "总部", mustChangePassword: false });
    if (url === "/api/hq/stores") return json({ stores: [], lastSync: null });
    if (url === "/api/hq/batches" && options?.method === "POST") return json({ message: "请检查审批信息" }, 400);
    if (url === "/api/hq/batches") return json({ batches: [] });
    if (url === "/api/hq/events") return json({ events: [] });
    if (url === "/api/hq/stores/sync") return json({ insertedCount: 1, updatedCount: 0, disabledCount: 0, syncedAt: "2026-09-18T00:00:00.000Z", changedStores: [{ name: "南京店", change: "added" }] });
    throw new Error(`unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(async () => {
  if (root) await act(async () => { root.unmount(); });
  host?.remove();
  vi.unstubAllGlobals();
});

describe("总部后台真实表单交互", () => {
  it("短赠码原因不发请求；服务端失败显示在表单旁且保留输入", async () => {
    await render();
    const form = host.querySelector("form")!;
    await act(async () => { change(form.querySelector("select")!, "trial"); });
    await act(async () => {
      change(form.querySelector<HTMLInputElement>("#hq-recipientLabel")!, "测试员");
      change(form.querySelector<HTMLInputElement>("#hq-expiresAt")!, "2026-12-31");
      change(form.querySelector<HTMLInputElement>("#hq-receiptRef")!, "APP-1");
      change(form.querySelector<HTMLInputElement>("#hq-approver")!, "孙勇");
      change(form.querySelector<HTMLInputElement>("#hq-approvalReason")!, "调试");
    });
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(form.querySelector('[role="alert"]')?.textContent).toContain("至少填写 4 字");
    expect(fetchMock.mock.calls.filter(call => call[0] === "/api/hq/batches" && call[1]?.method === "POST")).toHaveLength(0);
    await act(async () => { change(form.querySelector<HTMLInputElement>("#hq-approvalReason")!, "总部功能调试"); });
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(form.querySelector('[role="alert"]')?.textContent).toContain("请检查审批信息");
    expect(form.querySelector<HTMLInputElement>("#hq-approvalReason")?.value).toBe("总部功能调试");
  });

  it("门店清单只在本次同步页面出现，重新进入不重放", async () => {
    await render();
    expect(host.textContent).not.toContain("南京店");
    const syncButton = [...host.querySelectorAll("button")].find(button => button.textContent === "同步门店信息")!;
    await act(async () => { syncButton.click(); await Promise.resolve(); });
    expect(host.textContent).toContain("南京店 · 新增");
    await act(async () => { root.unmount(); }); host.remove();
    await render();
    expect(host.textContent).not.toContain("南京店");
  });

  it("批次已建立但列表刷新失败时明确告知已建立，避免重复提交", async () => {
    await render();
    const form = host.querySelector("form")!;
    const normalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url === "/api/hq/batches" && options?.method === "POST") return json({ id: 7, status: "pending" }, 201);
      if (url === "/api/hq/batches") throw new Error("列表暂不可用");
      return normalFetch(url, options);
    });
    await act(async () => { change(form.querySelector("select")!, "trial"); });
    await act(async () => {
      change(form.querySelector<HTMLInputElement>("#hq-recipientLabel")!, "测试员");
      change(form.querySelector<HTMLInputElement>("#hq-expiresAt")!, "2026-12-31");
      change(form.querySelector<HTMLInputElement>("#hq-receiptRef")!, "APP-1");
      change(form.querySelector<HTMLInputElement>("#hq-approver")!, "孙勇");
      change(form.querySelector<HTMLInputElement>("#hq-approvalReason")!, "总部功能调试");
    });
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await Promise.resolve(); });
    expect(form.querySelector('[role="status"]')?.textContent).toContain("批次已建立");
    expect(form.querySelector('[role="status"]')?.textContent).toContain("不要重复建立批次");
    expect(form.querySelector('[role="alert"]')).toBeNull();
    expect(fetchMock.mock.calls.filter(call => call[0] === "/api/hq/batches" && call[1]?.method === "POST")).toHaveLength(1);
  });
});

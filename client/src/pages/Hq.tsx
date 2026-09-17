import { useCallback, useEffect, useState, type FormEvent } from "react";

type Me = { username: string; mustChangePassword: boolean };
type Store = { id: number; code: string; name: string; enabled: number };
type Inventory = { allocated: number; redeemed: number; unused: number; expired: number; revoked: number };
type Batch = { id: number; storeId: number; amount: number; quantity: number; expiresAt: string; purpose: "purchase" | "promotion"; receiptRef: string | null; status: "pending" | "active" | "revoked"; createdAt: string; delivered: boolean; inventory: Inventory };
type Event = { id: number; batchId: number; adminId: number; action: string; quantity: number; reason: string | null; createdAt: string };

function csrfToken(): string {
  return document.cookie.split("; ").find(part => part.startsWith("__Host-hq_csrf="))?.split("=")[1] ?? "";
}
async function hqApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("content-type", "application/json");
  if (options.method && options.method !== "GET") headers.set("x-csrf-token", csrfToken());
  const response = await fetch(path, { ...options, credentials: "include", headers, cache: "no-store" });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(error.message ?? `操作未完成（${response.status}）`);
  }
  return response.json() as Promise<T>;
}

const inputClass = "w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-lg text-stone-900 focus:border-amber-600 focus:outline-none";
const buttonClass = "rounded-xl bg-amber-600 px-5 py-3 text-lg font-semibold text-white hover:bg-amber-700 disabled:opacity-50";
const cardClass = "rounded-2xl border border-stone-200 bg-white p-6 shadow-sm";

export default function Hq() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [stores, setStores] = useState<Store[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [storeCode, setStoreCode] = useState("");
  const [storeName, setStoreName] = useState("");
  const [batchForm, setBatchForm] = useState({ storeId: "", amount: "20", quantity: "10", expiresAt: "", purpose: "purchase" as "purchase" | "promotion", receiptRef: "", approver: "", approvalReason: "" });

  const refresh = useCallback(async () => {
    const [s, b, e] = await Promise.all([
      hqApi<{ stores: Store[] }>("/api/hq/stores"),
      hqApi<{ batches: Batch[] }>("/api/hq/batches"),
      hqApi<{ events: Event[] }>("/api/hq/events"),
    ]);
    setStores(s.stores); setBatches(b.batches); setEvents(e.events);
  }, []);

  useEffect(() => {
    hqApi<Me>("/api/hq/auth/me").then(value => {
      setMe(value);
      if (!value.mustChangePassword) void refresh().catch(error => setNotice(error.message));
    }).catch(() => {}).finally(() => setLoading(false));
  }, [refresh]);

  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const value = await hqApi<Me>("/api/hq/auth/login", { method: "POST", body: JSON.stringify({ username, password, code }) });
      setCode(""); setMe(value);
      if (!value.mustChangePassword) await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "登录失败"); }
    finally { setBusy(false); }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      await hqApi("/api/hq/auth/password/change", { method: "POST", body: JSON.stringify({ oldPassword: password, newPassword }) });
      setPassword(""); setNewPassword(""); setMe(current => current ? { ...current, mustChangePassword: false } : null);
      await refresh(); setNotice("初始密码已修改，可以管理门店和批次。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "改密失败"); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true); setNotice("");
    try { await hqApi("/api/hq/auth/logout", { method: "POST", body: "{}" }); setMe(null); setPassword(""); setBatches([]); setEvents([]); }
    catch (error) { setNotice(error instanceof Error ? error.message : "退出失败"); }
    finally { setBusy(false); }
  }

  async function addStore(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      await hqApi("/api/hq/stores", { method: "POST", body: JSON.stringify({ code: storeCode, name: storeName }) });
      setStoreCode(""); setStoreName(""); await refresh(); setNotice("门店已建立。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "门店建立失败"); }
    finally { setBusy(false); }
  }

  async function addBatch(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      await hqApi("/api/hq/batches", { method: "POST", body: JSON.stringify({
        storeId: Number(batchForm.storeId), amount: Number(batchForm.amount), quantity: Number(batchForm.quantity),
        expiresAt: new Date(batchForm.expiresAt + "T23:59:59").toISOString(), purpose: batchForm.purpose, receiptRef: batchForm.receiptRef,
        approver: batchForm.approver, approvalReason: batchForm.approvalReason,
      }) });
      setBatchForm(current => ({ ...current, receiptRef: "" })); await refresh(); setNotice("待确认批次已建立，尚未生成兑换码。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "批次建立失败"); }
    finally { setBusy(false); }
  }

  async function activate(batch: Batch) {
    if (!window.confirm(`已在线下核实门店 ${batch.storeId} 的结算／审批？确认后将一次性生成 ${batch.quantity} 张、每张 ${batch.amount} 积分的兑换码。CSV 只能下载这一次。`)) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/hq/batches/${batch.id}/activate`, {
        method: "POST", credentials: "include", headers: { "x-csrf-token": csrfToken() }, cache: "no-store",
      });
      if (!response.ok) throw new Error("生成或下载失败；请先查看批次状态，不要重复确认。若已激活，请停用未用码并重新配发。");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = `lejoy-codes-${batch.id}.csv`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      await refresh(); setNotice("兑换码 CSV 已开始下载。请安全交付店长；系统无法再次查看明文码。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "操作未完成"); }
    finally { setBusy(false); }
  }

  async function revoke(batch: Batch) {
    const reason = window.prompt(`停用批次 ${batch.id} 的未兑换码，不影响已兑换积分。请输入原因（至少 4 字）:`);
    if (!reason || reason.trim().length < 4) return;
    if (!window.confirm("确定停用？停用后未兑换码将无法使用。")) return;
    setBusy(true); setNotice("");
    try {
      await hqApi(`/api/hq/batches/${batch.id}/revoke`, { method: "POST", body: JSON.stringify({ reason }) });
      await refresh(); setNotice("未兑换码已停用。若需重新交付，请创建新批次。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "停用失败"); }
    finally { setBusy(false); }
  }

  async function confirmDelivery(batch: Batch) {
    const reason = window.prompt(`确认批次 ${batch.id} 已安全交付店长。请填写交付方式和接收人（至少 8 字）:`);
    if (!reason || reason.trim().length < 8) return;
    setBusy(true); setNotice("");
    try { await hqApi(`/api/hq/batches/${batch.id}/confirm-delivery`, { method: "POST", body: JSON.stringify({ reason }) }); await refresh(); setNotice("交付确认已记入审计记录。"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "交付确认失败"); }
    finally { setBusy(false); }
  }

  if (loading) return <main className="mx-auto max-w-6xl p-8 text-xl">正在检查总部登录状态…</main>;
  return <main className="min-h-screen bg-amber-50 px-4 py-8 text-stone-900">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-bold">乐享 AI · 总部积分后台</h1><p className="mt-1 text-stone-600">仅总部授权人员使用。店长线下申请与结算，向顾客免费赠码。</p></div>{me && <button className="rounded-xl border border-stone-400 px-4 py-2" onClick={logout} disabled={busy}>退出登录</button>}</header>
      {notice && <div role="alert" className="rounded-xl border border-amber-400 bg-amber-100 p-4 text-lg font-medium">{notice}</div>}
      {!me ? <form onSubmit={login} className={`${cardClass} mx-auto max-w-lg space-y-4`}><h2 className="text-2xl font-bold">总部登录</h2><label className="block">账号<input className={inputClass} autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required /></label><label className="block">密码<input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label><label className="block">动态验证码<input className={inputClass} inputMode="numeric" maxLength={6} value={code} onChange={event => setCode(event.target.value)} required /></label><button className={`${buttonClass} w-full`} disabled={busy}>登录</button></form>
      : me.mustChangePassword ? <form onSubmit={changePassword} className={`${cardClass} mx-auto max-w-lg space-y-4`}><h2 className="text-2xl font-bold">首次登录：修改初始密码</h2><p>完成改密后才能查看或发放兑换码。</p><label className="block">初始密码<input className={inputClass} type="password" value={password} onChange={event => setPassword(event.target.value)} required /></label><label className="block">新密码（至少 12 位）<input className={inputClass} type="password" value={newPassword} minLength={12} onChange={event => setNewPassword(event.target.value)} required /></label><button className={`${buttonClass} w-full`} disabled={busy}>修改密码</button></form>
      : <>
        <section className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={addStore} className={`${cardClass} space-y-3`}><h2 className="text-2xl font-bold">门店管理</h2><div className="grid gap-3 sm:grid-cols-2"><label>门店编号<input className={inputClass} value={storeCode} onChange={event => setStoreCode(event.target.value)} placeholder="如 SH001" required /></label><label>门店名称<input className={inputClass} value={storeName} onChange={event => setStoreName(event.target.value)} required /></label></div><button className={buttonClass} disabled={busy}>建立门店</button><ul className="space-y-1 text-stone-700">{stores.map(store => <li key={store.id}>{store.code} · {store.name}{!store.enabled ? "（停用）" : ""}</li>)}</ul></form>
          <form onSubmit={addBatch} className={`${cardClass} space-y-3`}><h2 className="text-2xl font-bold">建立待确认批次</h2><div className="grid gap-3 sm:grid-cols-2"><label>门店<select className={inputClass} value={batchForm.storeId} onChange={event => setBatchForm({ ...batchForm, storeId: event.target.value })} required><option value="">请选择</option>{stores.filter(store => store.enabled).map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label><label>每码积分<input className={inputClass} type="number" min="1" max="1000000" value={batchForm.amount} onChange={event => setBatchForm({ ...batchForm, amount: event.target.value })} required /></label><label>数量（最多 1000）<input className={inputClass} type="number" min="1" max="1000" value={batchForm.quantity} onChange={event => setBatchForm({ ...batchForm, quantity: event.target.value })} required /></label><label>有效期<input className={inputClass} type="date" value={batchForm.expiresAt} onChange={event => setBatchForm({ ...batchForm, expiresAt: event.target.value })} required /></label><label>用途<select className={inputClass} value={batchForm.purpose} onChange={event => setBatchForm({ ...batchForm, purpose: event.target.value as "purchase" | "promotion" })}><option value="purchase">店长线下采购</option><option value="promotion">总部批准赠送活动</option></select></label><label>线下凭证／审批编号<input className={inputClass} value={batchForm.receiptRef} onChange={event => setBatchForm({ ...batchForm, receiptRef: event.target.value })} required /></label>{batchForm.purpose === "promotion" && <><label>审批人<input className={inputClass} value={batchForm.approver} onChange={event => setBatchForm({ ...batchForm, approver: event.target.value })} required /></label><label>活动赠码原因<input className={inputClass} value={batchForm.approvalReason} onChange={event => setBatchForm({ ...batchForm, approvalReason: event.target.value })} required /></label></>}</div><p className="text-stone-600">本步不生成码；核实线下结算或活动审批后再单独确认。</p><button className={buttonClass} disabled={busy}>建立待确认批次</button></form>
        </section>
        <section className={cardClass}><div className="flex items-center justify-between"><h2 className="text-2xl font-bold">批次与库存</h2><button className="rounded-xl border border-stone-400 px-4 py-2" onClick={() => void refresh().catch(error => setNotice(error.message))}>刷新</button></div><p className="my-3 text-stone-600">已分配 = 已兑换 + 未兑换 + 已过期 + 已停用；待确认批次尚无兑换码。</p><div className="overflow-x-auto"><table className="w-full min-w-[800px] border-collapse text-left"><thead><tr className="border-b text-stone-600"><th className="p-2">批次／门店</th><th className="p-2">用途／面额</th><th className="p-2">状态／有效期</th><th className="p-2">库存</th><th className="p-2">操作</th></tr></thead><tbody>{batches.map(batch => <tr key={batch.id} className="border-b align-top"><td className="p-2">#{batch.id}<br />{stores.find(store => store.id === batch.storeId)?.name ?? batch.storeId}<br /><small>{batch.receiptRef}</small></td><td className="p-2">{batch.purpose === "purchase" ? "线下采购" : "总部活动"}<br />{batch.amount} 分 × {batch.quantity} 张</td><td className="p-2">{batch.status === "pending" ? "待确认" : batch.status === "active" ? "已激活" : "已停用"}<br />{batch.expiresAt.slice(0, 10)}{batch.delivered && <><br />已确认交付</>}</td><td className="p-2">已分配 {batch.inventory.allocated} · 已兑换 {batch.inventory.redeemed}<br />未兑换 {batch.inventory.unused} · 已过期 {batch.inventory.expired} · 已停用 {batch.inventory.revoked}</td><td className="p-2 space-x-2">{batch.status === "pending" && <button className={buttonClass} disabled={busy} onClick={() => void activate(batch)}>确认并下载 CSV</button>}{batch.status === "active" && !batch.delivered && <button className="rounded-xl border border-amber-700 px-4 py-3 text-amber-900" disabled={busy} onClick={() => void confirmDelivery(batch)}>确认已安全交付</button>}{batch.status !== "revoked" && <button className="rounded-xl border border-red-700 px-4 py-3 text-red-800" disabled={busy} onClick={() => void revoke(batch)}>停用未兑换码</button>}</td></tr>)}</tbody></table>{batches.length === 0 && <p className="p-4 text-stone-500">暂无批次</p>}</div></section>
        <section className={cardClass}><h2 className="mb-3 text-2xl font-bold">操作记录</h2><ul className="space-y-2">{events.map(item => <li key={item.id} className="border-b pb-2">{new Date(item.createdAt).toLocaleString("zh-CN")} · 管理员 #{item.adminId} · 批次 #{item.batchId} · {item.action} · {item.quantity} 张{item.reason ? ` · ${item.reason}` : ""}</li>)}{events.length === 0 && <li className="text-stone-500">暂无操作记录</li>}</ul></section>
      </>}
    </div>
  </main>;
}

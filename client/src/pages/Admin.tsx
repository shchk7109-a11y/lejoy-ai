import { useState } from "react";
import { Users, Settings, Coins, Plus, Search, ArrowLeft, Save, Loader2, RefreshCw, Edit2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

type Tab = "users" | "models" | "recharge";

interface AiModel {
  id: number;
  name: string;
  displayName: string | null;
  apiKey: string | null;
  baseUrl: string | null;
  modelName: string | null;
  enabled: number;
}

export default function Admin() {
  const { user, isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("users");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [rechargeDesc, setRechargeDesc] = useState("");
  const [editingModel, setEditingModel] = useState<AiModel | null>(null);

  const { data: usersData, refetch: refetchUsers } = trpc.admin.users.useQuery(undefined, { enabled: isAuthenticated && user?.role === "admin" });
  const { data: modelsData, refetch: refetchModels } = trpc.admin.getModels.useQuery(undefined, { enabled: isAuthenticated && user?.role === "admin" });

  const rechargeMutation = trpc.admin.rechargeCredits.useMutation({
    onSuccess: () => { toast.success("积分充值成功！"); setSelectedUserId(null); setRechargeAmount(""); setRechargeDesc(""); refetchUsers(); },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const updateModelMutation = trpc.admin.updateModel.useMutation({
    onSuccess: () => { toast.success("模型配置已保存！"); setEditingModel(null); refetchModels(); },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const initModelsMutation = trpc.admin.initModels.useMutation({
    onSuccess: () => { toast.success("模型配置已初始化！"); refetchModels(); },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center gap-4 p-6">
        <div className="text-5xl">🔒</div>
        <h2 className="text-xl font-bold text-stone-800">无访问权限</h2>
        <p className="text-stone-500 text-sm text-center">此页面仅限管理员访问</p>
        <Button onClick={() => window.history.back()} variant="outline" className="rounded-xl">返回首页</Button>
      </div>
    );
  }

  const filteredUsers = usersData?.filter((u: { name?: string | null; email?: string | null; openId: string }) =>
    !searchQuery || [u.name, u.email, u.openId].some((v) => v?.toLowerCase().includes(searchQuery.toLowerCase()))
  ) ?? [];

  const handleRecharge = () => {
    if (!selectedUserId) return toast.error("请选择用户");
    const amount = parseInt(rechargeAmount);
    if (!amount || amount <= 0) return toast.error("请输入有效的积分数量");
    rechargeMutation.mutate({ userId: selectedUserId, amount, description: rechargeDesc || undefined });
  };

  const handleSaveModel = () => {
    if (!editingModel) return;
    updateModelMutation.mutate({
      id: editingModel.id,
      displayName: editingModel.displayName ?? undefined,
      apiKey: editingModel.apiKey ?? undefined,
      baseUrl: editingModel.baseUrl ?? undefined,
      modelName: editingModel.modelName ?? undefined,
      enabled: editingModel.enabled,
    });
  };

  return (
    <div className="min-h-screen bg-stone-50 pb-20">
      <header className="bg-white px-4 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <button onClick={() => window.history.back()} className="flex items-center gap-1 text-stone-600 font-medium">
          <ArrowLeft className="w-5 h-5" /> 返回
        </button>
        <h1 className="text-lg font-bold font-serif text-stone-800">⚙️ 管理员后台</h1>
        <div className="w-16" />
      </header>

      {/* Tab 导航 */}
      <div className="bg-white border-b border-stone-200 px-4">
        <div className="max-w-lg mx-auto flex">
          {([
            { id: "users" as Tab, icon: <Users className="w-4 h-4" />, label: "会员管理" },
            { id: "recharge" as Tab, icon: <Coins className="w-4 h-4" />, label: "积分增送" },
            { id: "models" as Tab, icon: <Settings className="w-4 h-4" />, label: "模型配置" },
          ]).map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-stone-700 text-stone-800" : "border-transparent text-stone-400 hover:text-stone-600"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {/* 会员管理 */}
        {tab === "users" && (
          <>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索用户名、邮箱..." className="pl-9 rounded-xl" />
              </div>
              <button onClick={() => refetchUsers()} className="w-10 h-10 bg-white border border-stone-200 rounded-xl flex items-center justify-center text-stone-500 hover:bg-stone-50">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-stone-400">共 {filteredUsers.length} 位会员</p>
            <div className="space-y-2">
              {filteredUsers.map((u: { id: number; name?: string | null; email?: string | null; credits: number; role: string; createdAt: Date; customerInfo?: { wechatId?: string | null; phone?: string | null } }) => (
                <div key={u.id} className="bg-white border border-stone-200 rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-stone-100 rounded-full flex items-center justify-center text-lg">
                        {u.name?.[0] || "👤"}
                      </div>
                      <div>
                        <p className="font-medium text-stone-800">{u.name || "未知用户"}</p>
                        <p className="text-xs text-stone-400">{u.email || "无邮箱"}</p>
                        {u.customerInfo?.wechatId && <p className="text-xs text-green-600">微信: {u.customerInfo.wechatId}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-amber-600">
                        <Coins className="w-4 h-4" />
                        <span className="font-bold">{u.credits}</span>
                      </div>
                      <p className="text-xs text-stone-400 mt-0.5">{u.role === "admin" ? "管理员" : "普通用户"}</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-stone-100 flex justify-between items-center">
                    <p className="text-xs text-stone-400">注册: {new Date(u.createdAt).toLocaleDateString("zh-CN")}</p>
                    <button onClick={() => { setSelectedUserId(u.id); setTab("recharge"); }}
                      className="text-xs text-stone-600 bg-stone-100 px-3 py-1 rounded-full hover:bg-amber-100 hover:text-amber-700 transition-colors">
                      增送积分 →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 积分增送 */}
        {tab === "recharge" && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-amber-800 text-sm font-medium mb-1">💡 积分增送说明</p>
              <p className="text-amber-700 text-xs leading-relaxed">
                选择用户并输入积分数量，点击确认即可为用户增加积分。建议每次增送 50-200 积分，并备注来源（如：微信引流、活动奖励等）。
              </p>
            </div>

            <div>
              <Label className="font-semibold text-stone-700 mb-2 block">选择用户</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {usersData?.filter((u: { role: string }) => u.role !== "admin").map((u: { id: number; name?: string | null; email?: string | null; credits: number }) => (
                  <button key={u.id} onClick={() => setSelectedUserId(u.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${selectedUserId === u.id ? "bg-amber-50 border-amber-400" : "bg-white border-stone-200 hover:border-stone-300"}`}>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-stone-100 rounded-full flex items-center justify-center text-sm">
                        {u.name?.[0] || "👤"}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-stone-800">{u.name || "未知用户"}</p>
                        <p className="text-xs text-stone-400">{u.email || "无邮箱"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-amber-600">
                      <Coins className="w-3 h-3" />
                      <span className="text-sm font-bold">{u.credits}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="font-semibold text-stone-700 mb-2 block">增送积分数量</Label>
              <div className="flex gap-2 mb-2">
                {[50, 100, 200, 500].map((n) => (
                  <button key={n} onClick={() => setRechargeAmount(String(n))}
                    className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-all ${rechargeAmount === String(n) ? "bg-amber-500 border-amber-500 text-white" : "bg-white border-stone-200 text-stone-600 hover:border-amber-300"}`}>
                    {n}
                  </button>
                ))}
              </div>
              <Input value={rechargeAmount} onChange={(e) => setRechargeAmount(e.target.value)}
                type="number" placeholder="或自定义积分数量..." className="rounded-xl" />
            </div>

            <div>
              <Label className="font-semibold text-stone-700 mb-2 block">备注（选填）</Label>
              <Input value={rechargeDesc} onChange={(e) => setRechargeDesc(e.target.value)}
                placeholder="例如：微信引流奖励、活动赠送..." className="rounded-xl" />
            </div>

            <Button onClick={handleRecharge} disabled={rechargeMutation.isPending || !selectedUserId || !rechargeAmount}
              className="w-full rounded-xl py-3 text-base bg-amber-500 hover:bg-amber-600 gap-2">
              {rechargeMutation.isPending ? <><Loader2 className="w-5 h-5 animate-spin" /> 处理中...</> : <><Plus className="w-5 h-5" /> 确认增送积分</>}
            </Button>
          </div>
        )}

        {/* 模型配置 */}
        {tab === "models" && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <p className="text-blue-800 text-sm font-medium mb-1">⚙️ 模型配置说明</p>
              <p className="text-blue-700 text-xs leading-relaxed">
                修改AI模型配置后立即生效。Base URL 为谷高API中转地址，API Key 从谷高API平台获取。
              </p>
            </div>

            {!modelsData || modelsData.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-stone-400 text-sm mb-3">尚未初始化模型配置</p>
                <Button onClick={() => initModelsMutation.mutate()} disabled={initModelsMutation.isPending}
                  variant="outline" className="rounded-xl gap-2">
                  {initModelsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  初始化默认模型配置
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {modelsData.map((model: AiModel) => (
                  <div key={model.id} className="bg-white border border-stone-200 rounded-2xl p-4">
                    {editingModel?.id === model.id ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-semibold text-stone-700">{model.displayName || model.name}</p>
                          <div className="flex gap-2">
                            <button onClick={handleSaveModel} disabled={updateModelMutation.isPending}
                              className="w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center hover:bg-green-200">
                              {updateModelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button onClick={() => setEditingModel(null)}
                              className="w-8 h-8 bg-stone-100 text-stone-600 rounded-full flex items-center justify-center hover:bg-stone-200">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-stone-500 mb-1 block">模型名称</Label>
                          <Input value={editingModel.modelName ?? ""} onChange={(e) => setEditingModel({ ...editingModel, modelName: e.target.value })}
                            className="rounded-xl font-mono text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs text-stone-500 mb-1 block">API Key</Label>
                          <Input value={editingModel.apiKey ?? ""} onChange={(e) => setEditingModel({ ...editingModel, apiKey: e.target.value })}
                            type="password" className="rounded-xl font-mono text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs text-stone-500 mb-1 block">Base URL</Label>
                          <Input value={editingModel.baseUrl ?? ""} onChange={(e) => setEditingModel({ ...editingModel, baseUrl: e.target.value })}
                            className="rounded-xl font-mono text-sm" />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-stone-700">{model.displayName || model.name}</p>
                          <p className="text-xs text-stone-400 font-mono mt-0.5">{model.modelName || "未配置"}</p>
                          <p className="text-xs text-stone-400 mt-0.5">{model.baseUrl || "未配置Base URL"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${model.enabled ? "bg-green-100 text-green-600" : "bg-red-100 text-red-500"}`}>
                            {model.enabled ? "启用" : "禁用"}
                          </span>
                          <button onClick={() => setEditingModel(model)}
                            className="w-8 h-8 bg-stone-100 text-stone-600 rounded-full flex items-center justify-center hover:bg-stone-200">
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

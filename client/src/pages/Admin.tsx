import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ModuleHeader } from "@/components/ModuleHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Users, Cpu, Settings2, Gift, Lock, Unlock, Save, Plus, Trash2, BarChart3, Activity, AlertTriangle, CheckCircle2, Loader2, Mic, Volume2 } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function Admin() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background">
        <ModuleHeader title="管理后台" icon="🛡️" onBack={() => setLocation("/")} />
        <div className="container py-16 text-center">
          <p className="text-lg text-muted-foreground">您没有管理员权限</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ModuleHeader title="管理后台" icon="🛡️" onBack={() => setLocation("/")} />
      <div className="container py-6">
        <Tabs defaultValue="users">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="users" className="gap-1 text-xs"><Users className="w-3.5 h-3.5" /> 用户</TabsTrigger>
            <TabsTrigger value="models" className="gap-1 text-xs"><Cpu className="w-3.5 h-3.5" /> 模型</TabsTrigger>
            <TabsTrigger value="monitor" className="gap-1 text-xs"><BarChart3 className="w-3.5 h-3.5" /> 监控</TabsTrigger>
            <TabsTrigger value="settings" className="gap-1 text-xs"><Settings2 className="w-3.5 h-3.5" /> 设置</TabsTrigger>
          </TabsList>

          <TabsContent value="users"><UserManagement /></TabsContent>
          <TabsContent value="models"><ModelManagement /></TabsContent>
          <TabsContent value="monitor"><SystemMonitor /></TabsContent>
          <TabsContent value="settings"><SystemSettings /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ─── User Management ─────────────────────────────────────────
function UserManagement() {
  const { data: users, refetch } = trpc.admin.users.useQuery();
  const giftMut = trpc.admin.giftPoints.useMutation({
    onSuccess: () => { refetch(); toast.success("积分赠送成功"); },
    onError: (e: any) => toast.error(e.message),
  });
  const freezeMut = trpc.admin.freezeUser.useMutation({
    onSuccess: () => { refetch(); toast.success("操作成功"); },
    onError: (e: any) => toast.error(e.message),
  });
  const [giftUserId, setGiftUserId] = useState<number | null>(null);
  const [giftAmount, setGiftAmount] = useState("");

  return (
    <div className="space-y-3 mt-4">
      {users?.map((u: any) => (
        <Card key={u.id}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium">{u.name || "未命名用户"}</p>
                <p className="text-xs text-muted-foreground">ID: {u.id} · {u.email || "无邮箱"}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                  {u.role === "admin" ? "管理员" : "用户"}
                </Badge>
                {u.isFrozen && <Badge variant="destructive">已冻结</Badge>}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">积分: <strong className="text-foreground">{u.points}</strong></span>
              <div className="flex gap-1">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => { setGiftUserId(u.id); setGiftAmount(""); }}>
                      <Gift className="w-3 h-3 mr-1" /> 赠送
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>赠送积分给 {u.name || "用户"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        {[50, 100, 200, 500, 1000, 5000].map(amt => (
                          <Button
                            key={amt}
                            variant={giftAmount === String(amt) ? "default" : "outline"}
                            size="sm"
                            onClick={() => setGiftAmount(String(amt))}
                          >
                            {amt}
                          </Button>
                        ))}
                      </div>
                      <Input
                        type="number"
                        placeholder="自定义数量"
                        value={giftAmount}
                        onChange={e => setGiftAmount(e.target.value)}
                      />
                      <Button
                        className="w-full"
                        onClick={() => {
                          const amt = parseInt(giftAmount);
                          if (amt > 0 && giftUserId) {
                            giftMut.mutate({ userId: giftUserId, amount: amt });
                          }
                        }}
                        disabled={giftMut.isPending}
                      >
                        确认赠送
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => freezeMut.mutate({ userId: u.id, frozen: !u.isFrozen })}
                  disabled={freezeMut.isPending}
                >
                  {u.isFrozen ? <Unlock className="w-3 h-3 mr-1" /> : <Lock className="w-3 h-3 mr-1" />}
                  {u.isFrozen ? "解冻" : "冻结"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {(!users || users.length === 0) && (
        <p className="text-center text-muted-foreground py-8">暂无用户数据</p>
      )}
    </div>
  );
}

// ─── Model Management ────────────────────────────────────────
function ModelManagement() {
  const { data: configs, refetch } = trpc.admin.modelConfigs.useQuery();
  const saveMut = trpc.admin.saveModelConfig.useMutation({
    onSuccess: () => { refetch(); toast.success("模型配置已保存"); setEditConfig(null); setTtsCheckResult(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMut = trpc.admin.deleteModelConfig.useMutation({
    onSuccess: () => { refetch(); toast.success("已删除"); },
  });
  const testTtsMut = trpc.admin.testTts.useMutation({
    onSuccess: (result) => {
      setTtsCheckResult(result);
      toast.success("TTS 健康检查通过");
    },
    onError: (e: any) => {
      setTtsCheckResult(null);
      toast.error(e.message);
    },
  });

  const [editConfig, setEditConfig] = useState<any>(null);
  const [ttsSampleText, setTtsSampleText] = useState("这是管理后台的语音健康检查。");
  const [ttsCheckResult, setTtsCheckResult] = useState<any>(null);

  const openEditor = (config?: any) => {
    setTtsCheckResult(null);
    if (!config) {
      setEditConfig({
        configKey: "", label: "", provider: "google_proxy",
        modelName: "", apiKey: "", baseUrl: "", hasStoredApiKey: false,
      });
      return;
    }

    setEditConfig({
      ...config,
      apiKey: "",
      hasStoredApiKey: Boolean(config.apiKey),
    });
  };

  const handleSave = () => {
    if (!editConfig) return;
    saveMut.mutate({
      configKey: editConfig.configKey,
      label: editConfig.label,
      provider: editConfig.provider,
      modelName: editConfig.modelName,
      apiKey: editConfig.apiKey?.trim() || undefined,
      baseUrl: editConfig.baseUrl?.trim() || undefined,
    });
  };

  const handleTestTts = () => {
    if (!editConfig || editConfig.configKey !== "tts") return;
    testTtsMut.mutate({
      modelName: editConfig.modelName?.trim() || undefined,
      apiKey: editConfig.apiKey?.trim() || undefined,
      baseUrl: editConfig.baseUrl?.trim() || undefined,
      sampleText: ttsSampleText.trim() || undefined,
      voiceType: "grandma",
    });
  };

  return (
    <div className="space-y-3 mt-4">
      <Button
        variant="outline"
        size="sm"
        onClick={() => openEditor()}
      >
        <Plus className="w-4 h-4 mr-1" /> 添加模型配置
      </Button>

      {editConfig && (
        <Card className="border-primary animate-fade-in">
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">配置键名</Label>
                <Input
                  value={editConfig.configKey}
                  onChange={e => setEditConfig({ ...editConfig, configKey: e.target.value })}
                  placeholder="如: text_generation"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">显示名称</Label>
                <Input
                  value={editConfig.label}
                  onChange={e => setEditConfig({ ...editConfig, label: e.target.value })}
                  placeholder="如: 文本生成"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">提供商</Label>
                <Input
                  value={editConfig.provider}
                  onChange={e => setEditConfig({ ...editConfig, provider: e.target.value })}
                  placeholder="google_proxy / kimi / minimax"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">模型名称</Label>
                <Input
                  value={editConfig.modelName}
                  onChange={e => setEditConfig({ ...editConfig, modelName: e.target.value })}
                  placeholder="如: speech-02"
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">API Key</Label>
              <Input
                type="password"
                value={editConfig.apiKey}
                onChange={e => setEditConfig({ ...editConfig, apiKey: e.target.value })}
                placeholder={editConfig.hasStoredApiKey ? "已存在已保存密钥，如需更换请重新输入" : "输入API密钥"}
                className="mt-1"
              />
              {editConfig.hasStoredApiKey && !editConfig.apiKey && (
                <p className="text-[11px] text-muted-foreground mt-1">当前已保存 API Key，留空会继续使用原密钥。</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Base URL</Label>
              <Input
                value={editConfig.baseUrl}
                onChange={e => setEditConfig({ ...editConfig, baseUrl: e.target.value })}
                placeholder="如: https://api.gdoubolai.com/v1"
                className="mt-1"
              />
            </div>

            {editConfig.configKey === "tts" && (
              <Card className="bg-muted/40">
                <CardContent className="pt-4 space-y-3">
                  <div>
                    <Label className="text-xs">检测文本</Label>
                    <Textarea
                      value={ttsSampleText}
                      onChange={e => setTtsSampleText(e.target.value)}
                      rows={3}
                      className="mt-1"
                      placeholder="输入一段用于语音健康检查的文本"
                    />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="secondary" onClick={handleTestTts} disabled={testTtsMut.isPending}>
                      {testTtsMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Activity className="w-4 h-4 mr-1" />}检测 TTS
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saveMut.isPending}>
                      <Save className="w-4 h-4 mr-1" /> 保存
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setEditConfig(null); setTtsCheckResult(null); }}>取消</Button>
                  </div>

                  {ttsCheckResult && (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                        <CheckCircle2 className="w-4 h-4" /> TTS 健康检查通过
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <p>模型: {ttsCheckResult.modelUsed}</p>
                        <p>耗时: {ttsCheckResult.latencyMs}ms</p>
                        <p>格式: {ttsCheckResult.format} / {ttsCheckResult.mimeType}</p>
                        <p>大小: {Math.round(ttsCheckResult.byteLength / 1024)} KB</p>
                      </div>
                      {ttsCheckResult.warnings?.length > 0 && (
                        <div className="space-y-1 text-xs text-amber-700">
                          {ttsCheckResult.warnings.map((warning: string, index: number) => (
                            <p key={index}>- {warning}</p>
                          ))}
                        </div>
                      )}
                      <audio controls src={ttsCheckResult.audioUrl} className="w-full" />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {editConfig.configKey !== "tts" && (
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={saveMut.isPending}>
                  <Save className="w-4 h-4 mr-1" /> 保存
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditConfig(null)}>取消</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {configs?.map((c: any) => (
        <Card key={c.id}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium flex items-center gap-2">
                  {c.label}
                  {c.configKey === "tts" && <Badge variant="secondary">支持健康检查</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">{c.configKey} · {c.provider}</p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditor(c)}
                >
                  编辑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMut.mutate({ id: c.id })}
                  className="text-destructive"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>模型: {c.modelName}</p>
              <p>API Key: {c.apiKey || "未设置"}</p>
              <p>Base URL: {c.baseUrl || "未设置"}</p>
            </div>
            {c.configKey === "tts" && (
              <div className="mt-3 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground flex items-center gap-2">
                <Mic className="w-3.5 h-3.5" />
                点击“编辑”后可对当前 TTS 配置进行连通性检测并试听结果。
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── System Monitor ─────────────────────────────────────────
function SystemMonitor() {
  const [days, setDays] = useState(7);
  const { data: stats, isLoading } = trpc.admin.apiStats.useQuery({ days });

  return (
    <div className="space-y-4 mt-4">
      {/* Time range selector */}
      <div className="flex gap-2">
        {[1, 7, 30].map(d => (
          <Button
            key={d}
            variant={days === d ? "default" : "outline"}
            size="sm"
            onClick={() => setDays(d)}
          >
            {d === 1 ? "今天" : d === 7 ? "近7天" : "近30天"}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : (
        <>
          {/* Overview cards */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-4 text-center">
                <Activity className="w-5 h-5 mx-auto text-primary mb-1" />
                <p className="text-2xl font-bold">{stats?.totalCalls || 0}</p>
                <p className="text-xs text-muted-foreground">总调用</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <CheckCircle2 className="w-5 h-5 mx-auto text-green-500 mb-1" />
                <p className="text-2xl font-bold text-green-600">{stats?.successCalls || 0}</p>
                <p className="text-xs text-muted-foreground">成功</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <AlertTriangle className="w-5 h-5 mx-auto text-red-500 mb-1" />
                <p className="text-2xl font-bold text-red-600">{stats?.failedCalls || 0}</p>
                <p className="text-xs text-muted-foreground">失败</p>
              </CardContent>
            </Card>
          </div>

          {/* Module breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">模块调用统计</CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.byModule && stats.byModule.length > 0 ? (
                <div className="space-y-3">
                  {stats.byModule.map((m: any) => (
                    <div key={m.name} className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{m.name}</span>
                          <span className="text-xs text-muted-foreground">{m.total} 次</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className="bg-primary rounded-full h-2 transition-all"
                            style={{ width: `${stats.totalCalls ? (m.total / stats.totalCalls * 100) : 0}%` }}
                          />
                        </div>
                        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="text-green-600">成功 {m.success}</span>
                          <span className="text-red-600">失败 {m.failed}</span>
                          {m.avgDuration > 0 && <span>平均 {Math.round(m.avgDuration)}ms</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4">暂无调用数据</p>
              )}
            </CardContent>
          </Card>

          {/* Daily trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">每日调用趋势</CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.byDay && stats.byDay.length > 0 ? (
                <div className="space-y-2">
                  {stats.byDay.map((d: any) => (
                    <div key={d.date} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">{d.date.slice(5)}</span>
                      <div className="flex-1 bg-muted rounded-full h-3">
                        <div
                          className="bg-primary/70 rounded-full h-3 transition-all"
                          style={{
                            width: `${Math.max(5, (d.count / Math.max(...stats.byDay.map((x: any) => x.count), 1)) * 100)}%`
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium w-8 text-right">{d.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4">暂无趋势数据</p>
              )}
            </CardContent>
          </Card>

          {/* Recent errors */}
          {stats?.recentErrors && stats.recentErrors.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-destructive">近期错误日志</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.recentErrors.map((e: any, i: number) => (
                    <div key={i} className="text-xs border-l-2 border-destructive pl-3 py-1">
                      <div className="flex justify-between">
                        <span className="font-medium">{e.module}</span>
                        <span className="text-muted-foreground">{new Date(e.time).toLocaleString("zh-CN")}</span>
                      </div>
                      <p className="text-muted-foreground mt-0.5">{e.model || "未知模型"}: {e.error || "未知错误"}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── System Settings ─────────────────────────────────────────
function SystemSettings() {
  const { data: settings, refetch } = trpc.admin.settings.useQuery();
  const saveMut = trpc.admin.saveSetting.useMutation({
    onSuccess: () => { refetch(); toast.success("设置已保存"); },
    onError: (e: any) => toast.error(e.message),
  });

  const [defaultPoints, setDefaultPoints] = useState("");
  const [pointsPerUse, setPointsPerUse] = useState("");
  const [rechargeRatio, setRechargeRatio] = useState("");

  // Sync from server
  useEffect(() => {
    if (settings) {
      setDefaultPoints(settings.defaultPoints || "100");
      setPointsPerUse(settings.pointsPerUse || "1");
      setRechargeRatio(settings.rechargeRatio || "1:1");
    }
  }, [settings]);

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">积分规则设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-sm">新用户默认积分</Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="number"
                value={defaultPoints}
                onChange={e => setDefaultPoints(e.target.value)}
                className="flex-1"
              />
              <Button
                size="sm"
                onClick={() => saveMut.mutate({ key: "default_points", value: defaultPoints || "100" })}
                disabled={saveMut.isPending}
              >
                <Save className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-sm">每次使用消耗积分</Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="number"
                value={pointsPerUse}
                onChange={e => setPointsPerUse(e.target.value)}
                className="flex-1"
              />
              <Button
                size="sm"
                onClick={() => saveMut.mutate({ key: "points_per_use", value: pointsPerUse || "1" })}
                disabled={saveMut.isPending}
              >
                <Save className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-sm">充值比例说明</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={rechargeRatio}
                onChange={e => setRechargeRatio(e.target.value)}
                placeholder="如: 1元=10积分"
                className="flex-1"
              />
              <Button
                size="sm"
                onClick={() => saveMut.mutate({ key: "recharge_ratio", value: rechargeRatio || "1:1" })}
                disabled={saveMut.isPending}
              >
                <Save className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

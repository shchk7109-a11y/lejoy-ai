import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ModuleHeader } from "@/components/ModuleHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, Key, Activity, CheckCircle2, Loader2, Eye } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type ConfigState = {
  modelName: string;
  apiKey: string;
  baseUrl: string;
  hasStoredApiKey: boolean;
};

const configLabels: Record<string, string> = {
  text_generation: "文本生成模型",
  image_processing: "图像处理模型",
  tts: "语音合成模型",
  image_generation: "图像生成模型",
  kimi: "Kimi文本模型",
};

function createEmptyConfig(): ConfigState {
  return {
    modelName: "",
    apiKey: "",
    baseUrl: "",
    hasStoredApiKey: false,
  };
}

function createDefaultConfigs(): Record<string, ConfigState> {
  return Object.fromEntries(
    Object.keys(configLabels).map(key => [key, createEmptyConfig()])
  );
}

export default function Settings() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { data, isLoading, error } = trpc.apiConfig.list.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const saveMutation = trpc.apiConfig.save.useMutation({
    onSuccess: (_data, variables) => {
      if (variables.configKey === "tts") {
        setTtsTestResult(null);
      }
      if (variables.configKey && (configs[variables.configKey]?.apiKey || "").trim()) {
        setConfigs(prev => ({
          ...prev,
          [variables.configKey]: {
            ...prev[variables.configKey],
            apiKey: "",
            hasStoredApiKey: true,
          },
        }));
      }
      toast.success("配置已保存");
    },
    onError: err => toast.error(err.message),
  });
  const testTtsMutation = trpc.apiConfig.testTts.useMutation({
    onSuccess: result => {
      setTtsTestResult(result);
      toast.success("语音配置检测通过");
    },
    onError: err => {
      setTtsTestResult(null);
      toast.error(err.message);
    },
  });

  const [configs, setConfigs] = useState<Record<string, ConfigState>>(createDefaultConfigs);
  const [ttsSampleText, setTtsSampleText] = useState("这是乐享AI语音服务连通性检测。");
  const [ttsTestResult, setTtsTestResult] = useState<any>(null);
  const isGuestPreview = !isAuthenticated;
  const isActionDisabled = isGuestPreview || Boolean(error);

  useEffect(() => {
    if (!data) return;

    const map = createDefaultConfigs();
    for (const sc of data.systemConfigs) {
      map[sc.configKey] = {
        modelName: sc.modelName,
        apiKey: "",
        baseUrl: sc.baseUrl || "",
        hasStoredApiKey: Boolean(sc.apiKey),
      };
    }

    for (const uc of data.userConfigs) {
      const current = map[uc.configKey] ?? createEmptyConfig();
      map[uc.configKey] = {
        ...current,
        modelName: uc.modelName || current.modelName,
        apiKey: "",
        baseUrl: uc.baseUrl || current.baseUrl,
        hasStoredApiKey: Boolean(uc.apiKey) || current.hasStoredApiKey,
      };
    }

    setConfigs(map);
  }, [data]);

  const handleSave = (configKey: string) => {
    const c = configs[configKey];
    if (!c) return;
    saveMutation.mutate({
      configKey,
      modelName: c.modelName.trim() || undefined,
      apiKey: c.apiKey.trim() || undefined,
      baseUrl: c.baseUrl.trim() || undefined,
    });
  };

  const handleTestTts = () => {
    const ttsConfig = configs.tts;
    if (!ttsConfig) return;
    testTtsMutation.mutate({
      modelName: ttsConfig.modelName.trim() || undefined,
      apiKey: ttsConfig.apiKey.trim() || undefined,
      baseUrl: ttsConfig.baseUrl.trim() || undefined,
      sampleText: ttsSampleText.trim() || undefined,
      voiceType: "grandma",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <ModuleHeader title="模型设置" icon="⚙️" onBack={() => setLocation("/")} />
        <div className="container py-8 text-center text-muted-foreground">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ModuleHeader title="模型设置" icon="⚙️" onBack={() => setLocation("/")} />

      <div className="container py-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          您可以自定义 AI 模型的 API 配置。保存后会自动生效。未填写的字段会继续使用当前已保存配置或系统默认配置。
        </p>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
          图像生成回退链路：MiniMax 图像 API → Gemini 3.1 Flash Image（自动复用文本生成模型的中转地址和 API Key）→ 内置服务。配置好文本生成模型即可自动启用 Gemini 图像生成。
        </div>
        {isGuestPreview && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 flex items-start gap-2">
            <Eye className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              当前是访客预览模式，系统无法读取你已保存的模型配置。下方展示的是默认配置项，便于你检查界面；保存与检测需要先登录。
            </div>
          </div>
        )}
        {!isGuestPreview && error && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            已加载默认配置项，但读取你已保存的模型配置失败：{error.message}
          </div>
        )}

        {Object.entries(configs).map(([key, config]) => (
          <Card key={key}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Key className="w-4 h-4" />
                {configLabels[key] || key}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">模型名称</Label>
                <Input
                  value={config.modelName}
                  onChange={e => setConfigs(prev => ({ ...prev, [key]: { ...prev[key], modelName: e.target.value } }))}
                  placeholder={key === "tts" ? "例如: speech-02" : "例如: gemini-3.1-flash-lite-preview"}
                  className="mt-1"
                  disabled={isActionDisabled}
                />
              </div>
              <div>
                <Label className="text-xs">API Key</Label>
                <Input
                  type="password"
                  value={config.apiKey}
                  onChange={e => setConfigs(prev => ({ ...prev, [key]: { ...prev[key], apiKey: e.target.value } }))}
                  placeholder={config.hasStoredApiKey ? "已存在已保存密钥，如需更换请重新输入" : "输入API密钥"}
                  className="mt-1"
                  disabled={isActionDisabled}
                />
                {config.hasStoredApiKey && !config.apiKey && (
                  <p className="text-[11px] text-muted-foreground mt-1">当前已有已保存密钥，留空会继续使用原密钥。</p>
                )}
              </div>
              <div>
                <Label className="text-xs">Base URL</Label>
                <Input
                  value={config.baseUrl}
                  onChange={e => setConfigs(prev => ({ ...prev, [key]: { ...prev[key], baseUrl: e.target.value } }))}
                  placeholder="例如: https://api.gdoubolai.com/v1"
                  className="mt-1"
                  disabled={isActionDisabled}
                />
              </div>

              {key === "tts" && (
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
                        disabled={isActionDisabled}
                      />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="secondary" onClick={handleTestTts} disabled={isActionDisabled || testTtsMutation.isPending}>
                        {testTtsMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Activity className="w-4 h-4 mr-1" />}检测语音配置
                      </Button>
                      <Button size="sm" onClick={() => handleSave(key)} disabled={isActionDisabled || saveMutation.isPending}>
                        <Save className="w-4 h-4 mr-1" /> 保存
                      </Button>
                    </div>

                    {ttsTestResult && (
                      <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                          <CheckCircle2 className="w-4 h-4" /> 语音配置检测通过
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <p>模型: {ttsTestResult.modelUsed}</p>
                          <p>耗时: {ttsTestResult.latencyMs}ms</p>
                          <p>格式: {ttsTestResult.format} / {ttsTestResult.mimeType}</p>
                          <p>大小: {Math.round(ttsTestResult.byteLength / 1024)} KB</p>
                        </div>
                        {ttsTestResult.warnings?.length > 0 && (
                          <div className="space-y-1 text-xs text-amber-700">
                            {ttsTestResult.warnings.map((warning: string, index: number) => (
                              <p key={index}>- {warning}</p>
                            ))}
                          </div>
                        )}
                        <audio controls src={ttsTestResult.audioUrl} className="w-full" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {key !== "tts" && (
                <Button size="sm" onClick={() => handleSave(key)} disabled={isActionDisabled || saveMutation.isPending}>
                  <Save className="w-4 h-4 mr-1" /> 保存
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

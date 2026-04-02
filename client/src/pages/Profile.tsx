import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { usePoints } from "@/hooks/usePoints";
import { ModuleHeader } from "@/components/ModuleHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Coins, History, LogOut, CreditCard, Settings, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { BottomNav } from "@/components/BottomNav";

export default function Profile() {
  const { user, logout } = useAuth();
  const { points, refetch } = usePoints();
  const [, setLocation] = useLocation();
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [showRecharge, setShowRecharge] = useState(false);

  const { data: history } = trpc.points.history.useQuery();
  const rechargeMutation = trpc.points.recharge.useMutation({
    onSuccess: () => {
      toast.success("充值成功！");
      refetch();
      setShowRecharge(false);
      setRechargeAmount("");
    },
    onError: (err) => toast.error(err.message),
  });

  const typeLabels: Record<string, string> = {
    consume: "消费", recharge: "充值", gift: "赠送", register: "注册",
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="container flex items-center h-14">
          <span className="text-lg font-semibold">个人中心</span>
        </div>
      </div>

      <div className="container py-6 space-y-4">
        {/* User Info Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                {user?.name?.charAt(0) || "U"}
              </div>
              <div>
                <h2 className="text-lg font-semibold">{user?.name || "用户"}</h2>
                <p className="text-sm text-muted-foreground">{user?.email || ""}</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-amber-50 rounded-xl border border-amber-200">
              <div className="flex items-center gap-2">
                <Coins className="w-6 h-6 text-amber-500" />
                <div>
                  <p className="text-sm text-muted-foreground">当前积分</p>
                  <p className="text-2xl font-bold text-amber-700">{points}</p>
                </div>
              </div>
              <Button onClick={() => setShowRecharge(!showRecharge)} className="rounded-full">
                <CreditCard className="w-4 h-4 mr-1" /> 充值
              </Button>
            </div>

            {showRecharge && (
              <div className="mt-4 p-4 bg-muted rounded-xl space-y-3 animate-fade-in">
                <p className="text-sm font-medium">选择充值数量</p>
                <div className="grid grid-cols-3 gap-2">
                  {[10, 50, 100, 200, 500, 1000].map(amt => (
                    <Button
                      key={amt}
                      variant={rechargeAmount === String(amt) ? "default" : "outline"}
                      size="sm"
                      onClick={() => setRechargeAmount(String(amt))}
                    >
                      {amt}积分
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="自定义数量"
                    value={rechargeAmount}
                    onChange={e => setRechargeAmount(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => {
                      const amt = parseInt(rechargeAmount);
                      if (amt > 0) rechargeMutation.mutate({ amount: amt });
                    }}
                    disabled={!rechargeAmount || rechargeMutation.isPending}
                  >
                    确认充值
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Points History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="w-5 h-5" /> 积分记录
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history && history.length > 0 ? (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {history.map((log) => (
                  <div key={log.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{log.description || typeLabels[log.type]}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString("zh-CN")}
                      </p>
                    </div>
                    <span className={`text-sm font-bold ${log.amount > 0 ? "text-green-600" : "text-red-500"}`}>
                      {log.amount > 0 ? "+" : ""}{log.amount}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">暂无积分记录</p>
            )}
          </CardContent>
        </Card>

        {/* Settings & Actions */}
        <Card>
          <CardContent className="pt-4 space-y-1">
            <button
              onClick={() => setLocation("/settings")}
              className="w-full flex items-center justify-between py-3 px-1 hover:bg-muted/50 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm font-medium">模型设置</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
            <p className="text-xs text-muted-foreground px-1 pb-1">
              自定义AI模型的API Key和接口地址
            </p>
          </CardContent>
        </Card>

        {/* Logout */}
        <Button
          variant="outline"
          className="w-full text-destructive border-destructive/30"
          onClick={() => { logout(); setLocation("/"); }}
        >
          <LogOut className="w-4 h-4 mr-2" /> 退出登录
        </Button>
      </div>

      <BottomNav />
    </div>
  );
}

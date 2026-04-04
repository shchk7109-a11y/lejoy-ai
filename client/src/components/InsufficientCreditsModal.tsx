import { Coins, MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentCredits?: number;
  requiredCredits?: number;
}

export default function InsufficientCreditsModal({ isOpen, onClose, currentCredits, requiredCredits }: Props) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-6 relative shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-stone-400 hover:text-stone-600">
          <X className="w-6 h-6" />
        </button>

        <div className="text-center mb-5">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Coins className="w-8 h-8 text-amber-500" />
          </div>
          <h3 className="text-xl font-bold text-stone-800 mb-1">积分不足</h3>
          {currentCredits !== undefined && requiredCredits !== undefined && (
            <p className="text-stone-500 text-sm">
              当前积分 <span className="font-bold text-amber-600">{currentCredits}</span>，
              本次需要 <span className="font-bold text-red-500">{requiredCredits}</span> 积分
            </p>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
          <p className="text-stone-700 text-center text-sm leading-relaxed">
            积分用完了，请联系管理员获取更多积分。
            <br />
            添加微信后发送您的账号，即可免费获得积分！
          </p>
        </div>

        <div className="space-y-3">
          <Button
            className="w-full bg-green-500 hover:bg-green-600 text-white rounded-2xl py-3 text-base font-bold flex items-center justify-center gap-2"
            onClick={() => {
              // 可以在这里配置管理员微信二维码
              alert("请联系管理员微信获取积分");
            }}
          >
            <MessageCircle className="w-5 h-5" />
            联系管理员获取积分
          </Button>
          <Button variant="outline" className="w-full rounded-2xl py-3 text-base" onClick={onClose}>
            稍后再说
          </Button>
        </div>
      </div>
    </div>
  );
}

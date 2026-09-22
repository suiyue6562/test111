import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 合规确认弹窗：首次访问强制展示，用户确认后持久记录（localStorage）。
 * 修改文案时递增 KEY 版本号，老访客会重新确认。
 */
const KEY = "complianceAccepted:v1";

export default function ComplianceGate() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  const accept = () => {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      // 隐私模式下写不进去也不阻塞
    }
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="text-lg font-bold">最全 API 中转站导航</div>
        </div>
        <div className="text-sm font-semibold">地区限制与使用说明</div>
        <div className="text-sm text-muted-foreground space-y-3 leading-relaxed">
          <p>
            本站的服务范围不包括中国大陆地区。是否适用这一限制，应以个人的实际所在地、常住地区和主要使用场所为准；代表企业或其他组织使用时，还需结合主体注册地判断。属于受限范围的用户，请勿继续使用。
          </p>
          <p>
            使用本站前，请自行确认账号条件和业务用途符合适用法律及有关平台要求。本站及所收录链接不得被用作绕开网络访问管理或其他监管规定的途径；因不符合上述要求而引发的后果，使用者应依法承担相应责任。
          </p>
        </div>
        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={() => { window.location.href = "about:blank"; }}>
            离开本站
          </Button>
          <Button className="flex-1 bg-orange-600 hover:bg-orange-700" onClick={accept}>
            我已阅读并确认，继续使用
          </Button>
        </div>
      </div>
    </div>
  );
}

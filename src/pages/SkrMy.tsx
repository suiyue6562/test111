import { useNavigate } from "react-router";
import { ArrowLeft, Copy, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/format";

export default function SkrMy() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth({
    redirectOnUnauthenticated: true,
  });
  const { data } = trpc.skr.myCodes.useQuery(undefined, { enabled: isAuthenticated });

  if (authLoading) return null;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => navigate("/skr")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Package className="w-5 h-5 text-orange-500" /> 我的码包
          </h1>
          <p className="text-sm text-muted-foreground">你领取到的所有兑换码</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        {!data?.length ? (
          <div className="text-sm text-muted-foreground py-10 text-center">
            还没有领取过兑换码，去活动页看看吧
          </div>
        ) : (
          <div className="space-y-2">
            {data.map((c) => (
              <div key={c.id} className="rounded-lg border p-3 flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm font-semibold tracking-wider">{c.code}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.actTitle}
                    {c.platformName && ` · ${c.platformName}`} · 领取于 {fmtDateTime(c.claimedAt)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(c.code);
                    toast.success("已复制");
                  }}
                >
                  <Copy className="w-3.5 h-3.5 mr-1" /> 复制
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

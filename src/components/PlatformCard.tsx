import { useNavigate } from "react-router";
import { ExternalLink, MessageSquarePlus, Star, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import UptimeBar from "@/components/UptimeBar";
import { fmtLatency, vendorColor } from "@/lib/format";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Status = "operational" | "slow" | "down" | "unknown";
type Stage = "new" | "stable" | "watch" | "closed";

export interface CardPlatform {
  id: number;
  name: string;
  domain: string;
  url: string;
  description: string | null;
  vendors: string[];
  tags: string[];
  status: Status;
  stage: Stage;
  featured: boolean;
  visitCount: number;
  uptime: number | null;
  avgLatency: number | null;
  daily: { date: string; status: "ok" | "slow" | "down" | "nodata"; latencyMs: number | null }[];
}

const STATUS_META: Record<Status, { label: string; cls: string; dot: string }> = {
  operational: { label: "正常", cls: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  slow: { label: "偏慢", cls: "border-amber-500/30 text-amber-600 dark:text-amber-400", dot: "bg-amber-400" },
  down: { label: "异常", cls: "border-rose-500/30 text-rose-600 dark:text-rose-400", dot: "bg-rose-500" },
  unknown: { label: "未知", cls: "border-muted text-muted-foreground", dot: "bg-muted-foreground/40" },
};

const STAGE_META: Record<Stage, { label: string; cls: string }> = {
  stable: { label: "持续运营", cls: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  new: { label: "新站收录", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  watch: { label: "观察中", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  closed: { label: "已关闭", cls: "bg-muted text-muted-foreground" },
};

export default function PlatformCard({
  platform: p,
  compareMode,
  compared,
  onToggleCompare,
}: {
  platform: CardPlatform;
  compareMode?: boolean;
  compared?: boolean;
  onToggleCompare?: (id: number) => void;
}) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const visit = trpc.platform.visit.useMutation({
    onSuccess: (data) => window.open(data.url, "_blank", "noopener"),
  });
  const fav = trpc.platform.toggleFavorite.useMutation({
    onSuccess: (r) => {
      toast.success(r.favorited ? "已收藏" : "已取消收藏");
      utils.platform.myFavorites.invalidate();
    },
    onError: () => toast.error("请先登录"),
  });

  const sm = STATUS_META[p.status];
  const st = STAGE_META[p.stage];

  return (
    <div className="rounded-xl border bg-card p-4 hover:shadow-md transition-shadow flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <button
            className="font-semibold text-[15px] hover:text-indigo-600 dark:hover:text-indigo-400 truncate block text-left"
            onClick={() => navigate(`/site/${p.domain}`)}
          >
            {p.name}
          </button>
          <div className="text-xs text-muted-foreground truncate">{p.domain}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {compareMode && (
            <Button
              size="icon"
              variant={compared ? "default" : "outline"}
              className="h-7 w-7"
              onClick={() => onToggleCompare?.(p.id)}
              title="加入对比"
            >
              <Scale className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-amber-500"
            onClick={() =>
              isAuthenticated
                ? fav.mutate({ platformId: p.id })
                : toast.error("请先登录后再收藏")
            }
            title="收藏"
          >
            <Star className="w-4 h-4" />
          </Button>
          <Badge variant="outline" className={`gap-1 ${sm.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
            {sm.label}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {p.vendors.map((v) => (
          <span key={v} className={`text-[11px] px-1.5 py-0.5 rounded ${vendorColor(v)}`}>
            {v}
          </span>
        ))}
        <span className={`text-[11px] px-1.5 py-0.5 rounded ml-auto ${st.cls}`}>{st.label}</span>
      </div>

      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-indigo-600 dark:text-indigo-400">
            30天 {p.uptime != null ? `${p.uptime.toFixed(1)}%` : "—"} 正常
          </span>
          <span className="text-muted-foreground">
            平均延迟 {fmtLatency(p.avgLatency)}
          </span>
        </div>
        <UptimeBar days={p.daily} />
      </div>

      <div className="flex gap-2 mt-auto">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => visit.mutate({ platformId: p.id })}
          disabled={visit.isPending}
        >
          <ExternalLink className="w-3.5 h-3.5 mr-1" /> 访问
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => navigate(`/site/${p.domain}`)}
        >
          <MessageSquarePlus className="w-3.5 h-3.5 mr-1" /> 点评
        </Button>
      </div>
    </div>
  );
}

import { useNavigate } from "react-router";
import { ExternalLink, MessageSquarePlus, Star, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import UptimeBar from "@/components/UptimeBar";
import { fmtLatency, timeAgo, vendorColor, fmtRatio } from "@/lib/format";
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
  /** AI 提炼的优势标签 */
  aiTags?: string[] | null;
  vendors: string[];
  tags: string[];
  status: Status;
  stage: Stage;
  featured: boolean;
  visitCount: number;
  adActive?: boolean;
  uptime: number | null;
  avgLatency: number | null;
  daily: { date: string; status: "ok" | "slow" | "down" | "nodata"; latencyMs: number | null }[];
  uptime7?: number | null;
  modelCount?: number;
  /** 热门模型报价摘要（每族该站最低倍率） */
  priceHints?: { label: string; ratio: number }[];
  /** 全站最低计费倍率 */
  minRatio?: number | null;
  apiConfirmed?: boolean;
  lastProbeAt?: Date | string | null;
  lastProbeLatency?: number | null;
  probes?: { status: "ok" | "slow" | "down" | "nodata"; latencyMs: number | null }[];
}

/** 实测状态分级（对齐行业惯例）：已实测 / 持续监测 / 尚未验证 */
function testMeta(p: CardPlatform): { label: string; cls: string } {
  if (p.apiConfirmed) return { label: "已实测", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
  if (p.status === "operational" || p.status === "slow" || p.status === "unknown")
    return { label: "持续监测", cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400" };
  return { label: "尚未验证", cls: "bg-muted text-muted-foreground" };
}

const PROBE_DOT: Record<string, string> = {
  ok: "bg-emerald-500",
  slow: "bg-amber-400",
  down: "bg-rose-500",
  nodata: "bg-muted-foreground/30",
};

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
  adSource,
}: {
  platform: CardPlatform;
  compareMode?: boolean;
  compared?: boolean;
  onToggleCompare?: (id: number) => void;
  /** 广告位来源标记：ad-home / ad-list，点击时随访问记录上报 */
  adSource?: "ad-home" | "ad-list";
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
        <div className="min-w-0 flex-1 overflow-hidden">
          <button
            className="font-semibold text-[15px] hover:text-orange-600 dark:hover:text-orange-400 truncate block text-left max-w-full"
            onClick={() => navigate(`/site/${p.domain}`)}
          >
            {p.name}
          </button>
          <div className="text-xs text-muted-foreground truncate">{p.domain}</div>
        </div>        <div className="flex items-center gap-1.5 shrink-0">
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

      {/* AI 优势标签：短词徽章，扫一眼就知道站点亮点 */}
      {p.aiTags && p.aiTags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {p.aiTags.map((t) => (
            <span
              key={t}
              className="text-[11px] px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400 font-medium"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* 热门模型报价：用户决策的核心依据 */}
      {p.priceHints && p.priceHints.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {p.priceHints.map((h) => (
            <span
              key={h.label}
              className="text-[11px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium"
            >
              {h.label} {fmtRatio(h.ratio)}x
            </span>
          ))}
          {p.minRatio != null && (
            <span className="text-[11px] text-muted-foreground ml-auto">最低 {fmtRatio(p.minRatio)}x</span>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        {p.vendors.map((v) => (
          <span key={v} className={`text-[11px] px-1.5 py-0.5 rounded ${vendorColor(v)}`}>
            {v}
          </span>
        ))}
        {p.adActive && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 ml-auto">
            广告
          </span>
        )}
        <span className={`text-[11px] px-1.5 py-0.5 rounded ${p.adActive ? "" : "ml-auto"} ${st.cls}`}>{st.label}</span>
      </div>

      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-orange-600 dark:text-orange-400">
            30天 {p.uptime != null ? `${p.uptime.toFixed(1)}%` : "—"} 正常
          </span>
          <span className="text-muted-foreground">
            平均延迟 {fmtLatency(p.avgLatency)}
          </span>
        </div>
        <UptimeBar days={p.daily} />
        {/* 实测状态 + 最近检测 + 7天可用率 + 模型覆盖 */}
        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted-foreground flex-wrap">
          <span className={`px-1.5 py-0.5 rounded ${testMeta(p).cls}`}>{testMeta(p).label}</span>
          <span>近7天 {p.uptime7 != null ? `${p.uptime7.toFixed(0)}%` : "—"}</span>
          <span>·</span>
          <span>{p.modelCount ? `${p.modelCount} 模型` : "模型 —"}</span>
          {p.lastProbeAt && (
            <>
              <span>·</span>
              <span>检测 {timeAgo(p.lastProbeAt)}</span>
            </>
          )}
          {/* 最近 12 次探测点条（旧→新） */}
          {p.probes && p.probes.length > 0 && (
            <span className="flex items-center gap-0.5 ml-auto" title="最近 12 次探测状态">
              {p.probes.map((pr, i) => (
                <span key={i} className={`w-1.5 h-1.5 rounded-full ${PROBE_DOT[pr.status]}`} />
              ))}
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-auto">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => visit.mutate({ platformId: p.id, source: adSource })}
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

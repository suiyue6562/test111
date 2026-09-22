import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowUpDown,
  BadgeCheck,
  ChevronDown,
  ExternalLink,
  Flame,
  MessageSquarePlus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { fmtLatency, vendorColor, timeAgo, fmtRatio } from "@/lib/format";
import { toast } from "sonner";

type SortKey = "featured" | "ratioAsc" | "uptimeDesc" | "latencyAsc";

export default function Pricing() {
  const navigate = useNavigate();
  const { data: hotModels } = trpc.pricing.hotModels.useQuery({ limit: 40 });
  const [model, setModel] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("featured");
  const [onlyConfirmed, setOnlyConfirmed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState("");
  const visit = trpc.platform.visit.useMutation({
    onSuccess: (d) => window.open(d.url, "_blank", "noopener"),
  });

  const tabs = useMemo(() => hotModels?.slice(0, 8) ?? [], [hotModels]);
  const inTabs = useMemo(() => tabs.some((t) => t.label === model), [tabs, model]);

  useEffect(() => {
    if (!model && hotModels && hotModels.length > 0) setModel(hotModels[0].label);
  }, [hotModels, model]);

  const { data, isLoading } = trpc.pricing.leaderboard.useQuery(
    { model, sort, onlyConfirmed },
    { enabled: !!model },
  );
  const { data: board, isLoading: boardLoading } = trpc.pricing.lowestBoard.useQuery();

  const moreModels = useMemo(() => {
    const all = hotModels?.slice(8) ?? [];
    const q = modelQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter((m) => m.label.toLowerCase().includes(q));
  }, [hotModels, modelQuery]);

  const pickModel = (m: string) => {
    setModel(m);
    setMoreOpen(false);
    setModelQuery("");
    document.getElementById("leaderboard")?.scrollIntoView({ behavior: "smooth" });
  };

  const sortBtn = (key: SortKey, label: string) => (
    <button
      className={`inline-flex items-center gap-1 ${sort === key ? "text-orange-600 dark:text-orange-400 font-medium" : "text-muted-foreground hover:text-foreground"}`}
      onClick={() => {
        setSort(key);
        toast.success(`已按「${label}」排序`);
      }}
    >
      {label} <ArrowUpDown className="w-3 h-3" />
    </button>
  );

  return (
    <div className="space-y-5">
      {/* 热门模型全网最低价榜单 */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="w-4 h-4 text-amber-500" />
          <h2 className="font-semibold">热门模型全网最低价</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          在售站点最多的热门模型及其全网最低价站点，点击模型可查看完整排行榜
        </p>
        {boardLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {board?.map((b) => (
              <div key={b.model} className="rounded-lg border p-3 hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[11px] px-1.5 py-0.5 rounded ${vendorColor(b.vendor)}`}>{b.vendor}</span>
                  <button
                    className="font-mono text-xs font-medium hover:text-orange-600 dark:hover:text-orange-400 truncate"
                    title="查看该模型排行榜"
                    onClick={() => pickModel(b.model)}
                  >
                    {b.model}
                  </button>
                  <span className="text-[11px] text-muted-foreground ml-auto shrink-0">{b.sellers} 站在售</span>
                </div>
                <div className="flex items-end justify-between mt-2">
                  <div>
                    <button
                      className="text-sm font-medium hover:text-orange-600 dark:hover:text-orange-400"
                      onClick={() => navigate(`/site/${b.minDomain}`)}
                    >
                      {b.minPlatformName}
                    </button>
                    {b.minPlatformName !== b.minDomain && (
                      <div className="text-xs text-muted-foreground">{b.minDomain}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-orange-600 dark:text-orange-400">
                      {b.isRatio ? `${fmtRatio(b.minEff)}x` : `￥${b.minEff.toFixed(3)}/次`}
                    </div>
                    {b.cheaperThanSecond != null && b.cheaperThanSecond > 0 && (
                      <Badge variant="secondary" className="text-[10px] text-emerald-600 dark:text-emerald-400">
                        比次低便宜 {b.cheaperThanSecond}%
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 模型排行榜 */}
      <div id="leaderboard" className="space-y-4 scroll-mt-4">
        {/* 模型 tab 切换 */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Flame className="w-4 h-4 text-orange-500 shrink-0" />
            {tabs.map((t) => (
              <Button
                key={t.label}
                size="sm"
                variant={model === t.label ? "default" : "outline"}
                className={model === t.label ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}
                onClick={() => setModel(t.label)}
              >
                {t.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant={!inTabs && model ? "default" : "ghost"}
              className={!inTabs && model ? "bg-orange-500 hover:bg-orange-600 text-white" : "border border-dashed"}
              onClick={() => setMoreOpen((v) => !v)}
            >
              {!inTabs && model ? model : "更多模型"} <ChevronDown className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
          {moreOpen && (
            <div className="space-y-2 pt-1 border-t">
              <Input
                value={modelQuery}
                onChange={(e) => setModelQuery(e.target.value)}
                placeholder="搜索更多模型…"
                className="h-8 text-xs max-w-xs"
              />
              <div className="flex items-center gap-2 flex-wrap max-h-36 overflow-y-auto pr-1">
                {moreModels.map((m) => (
                  <Button key={m.label} size="sm" variant="ghost" className="border" onClick={() => pickModel(m.label)}>
                    {m.label}
                    <span className="text-[10px] text-muted-foreground ml-1">{m.sellers}站</span>
                  </Button>
                ))}
                {moreModels.length === 0 && (
                  <span className="text-xs text-muted-foreground">无匹配模型</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 模型头卡：AI 简介 + 能力标签 + 实测统计 */}
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold">{model}</h1>
                {data?.profile?.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[11px]">
                    {t}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
                {data?.profile?.blurb ?? "AI 正在整理该模型的介绍，先看看各站报价与实测数据。"}
              </p>
            </div>
            <div className="flex gap-5 text-sm shrink-0">
              <div className="text-center">
                <div className="text-lg font-bold">{data?.stats?.sellers ?? "…"}</div>
                <div className="text-xs text-muted-foreground">实测站点</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold">
                  {data?.stats?.avgUptime != null ? `${data.stats.avgUptime}%` : "—"}
                </div>
                <div className="text-xs text-muted-foreground">平均在线率</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
                  {data?.stats?.minEff != null
                    ? `${fmtRatio(data.stats.minEff)}x ~ ${fmtRatio(data.stats.maxEff ?? data.stats.minEff)}x`
                    : "—"}
                </div>
                <div className="text-xs text-muted-foreground">倍率区间</div>
              </div>
            </div>
          </div>
          {/* 筛选与排序 */}
          <div className="flex items-center gap-3 mt-4 pt-3 border-t flex-wrap">
            <div className="flex rounded-lg border overflow-hidden text-xs">
              <button
                className={`px-3 py-1.5 ${!onlyConfirmed ? "bg-orange-500 text-white" : "hover:bg-muted"}`}
                onClick={() => setOnlyConfirmed(false)}
              >
                全部站点
              </button>
              <button
                className={`px-3 py-1.5 inline-flex items-center gap-1 ${onlyConfirmed ? "bg-orange-500 text-white" : "hover:bg-muted"}`}
                onClick={() => setOnlyConfirmed(true)}
              >
                <BadgeCheck className="w-3 h-3" /> 仅已实测
              </button>
            </div>
            <div className="flex items-center gap-3 text-xs ml-auto">
              {sortBtn("featured", "精选")}
              {sortBtn("ratioAsc", "价格最低")}
              {sortBtn("uptimeDesc", "在线率")}
              {sortBtn("latencyAsc", "延迟")}
            </div>
          </div>
        </div>

        {/* 排行榜表格 */}
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b text-left">
                <th className="p-3 font-medium text-muted-foreground w-10">#</th>
                <th className="p-3 font-medium text-muted-foreground">站点</th>
                <th className="p-3 font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> AI 推荐分
                  </span>
                </th>
                <th className="p-3 font-medium text-muted-foreground">价格（倍率）</th>
                <th className="p-3 font-medium text-muted-foreground">价格趋势</th>
                <th className="p-3 font-medium text-muted-foreground">在线率 / 延迟</th>
                <th className="p-3 font-medium text-muted-foreground">采集时间</th>
                <th className="p-3 font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-3" colSpan={8}><Skeleton className="h-6" /></td>
                  </tr>
                ))
              ) : data?.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-muted-foreground">
                    该模型暂无符合条件的站点报价
                  </td>
                </tr>
              ) : (
                data?.items.map((it, idx) => (
                  <tr
                    key={it.platformId}
                    className={`border-b last:border-0 hover:bg-muted/40 ${it.adActive && sort === "featured" ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}`}
                  >
                    <td className="p-3 text-muted-foreground">{idx + 1}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          className="font-medium hover:text-orange-600 dark:hover:text-orange-400"
                          onClick={() => navigate(`/site/${it.domain}`)}
                        >
                          {it.name}
                        </button>
                        {it.adActive && (
                          <Badge className="text-[10px] bg-amber-500 hover:bg-amber-500 text-white px-1 py-0">广告</Badge>
                        )}
                        {it.apiConfirmed && (
                          <span title="API 已实测可用">
                            <BadgeCheck className="w-3.5 h-3.5 text-emerald-500" />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        {it.aiTags.slice(0, 3).map((t) => (
                          <span key={t} className="text-[10px] px-1 py-px rounded bg-muted text-muted-foreground">
                            {t}
                          </span>
                        ))}
                        <span className="text-[10px] text-muted-foreground">{it.domain}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      {it.score > 0 ? (
                        <span
                          className={`inline-flex items-center justify-center w-9 h-6 rounded text-xs font-bold ${
                            it.score >= 80
                              ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                              : it.score >= 60
                                ? "bg-muted text-foreground"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {Math.round(it.score)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">评分中</span>
                      )}
                    </td>
                    <td className="p-3 font-semibold text-orange-600 dark:text-orange-400">
                      {it.isRatio ? `${fmtRatio(String(it.eff))}x` : `￥${it.eff.toFixed(3)}/次`}
                      <div className="text-[10px] font-normal text-muted-foreground font-mono">
                        {it.variant}
                        {it.groupName !== "default" && (
                          <span className="ml-1 text-amber-600 dark:text-amber-400">组:{it.groupName}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      {it.priceTrend == null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : it.priceTrend > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-xs text-red-500">
                          <TrendingUp className="w-3.5 h-3.5" /> 涨 {it.priceTrend}%
                        </span>
                      ) : it.priceTrend < 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-xs text-emerald-500">
                          <TrendingDown className="w-3.5 h-3.5" /> 降 {Math.abs(it.priceTrend)}%
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">持平</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div>{it.uptime != null ? `${it.uptime.toFixed(1)}%` : "未知"}</div>
                      <div className="text-xs text-muted-foreground">{fmtLatency(it.avgLatency)}</div>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {it.collectedAt ? `更新于 ${timeAgo(it.collectedAt)}` : "—"}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => visit.mutate({ platformId: it.platformId })}>
                          <ExternalLink className="w-3.5 h-3.5 mr-1" /> 访问
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => navigate(`/site/${it.domain}`)}>
                          <MessageSquarePlus className="w-3.5 h-3.5 mr-1" /> 点评
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          精选排序由 AI 推荐分决定（依据 30 天在线率、延迟、价格竞争力与用户口碑），广告主可按投放权重置顶（带「广告」标识，最多 3 席）。
          价格为各站缺省用户组的实际计费倍率，来自各站公开接口，最终以官网为准。
        </p>
      </div>
    </div>
  );
}

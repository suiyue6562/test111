import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router";
import {
  ExternalLink, Star, Heart, Gift, Copy, ChevronDown, ChevronRight, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import UptimeBar from "@/components/UptimeBar";
import { fmtLatency, fmtDate, timeAgo, vendorColor } from "@/lib/format";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const PROBE_DOT: Record<string, string> = {
  ok: "bg-emerald-500",
  slow: "bg-amber-400",
  down: "bg-rose-500",
  nodata: "bg-muted-foreground/30",
};

const STAGE_LABEL: Record<string, string> = {
  new: "新站收录",
  stable: "持续运营",
  watch: "观察中",
  closed: "已关闭",
};

export default function PlatformDetail() {
  const { domain = "" } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.platform.detail.useQuery({ domain });
  const { data: prices } = trpc.pricing.forPlatform.useQuery(
    { platformId: data?.platform.id ?? 0 },
    { enabled: !!data },
  );
  const { data: skrActs } = trpc.skr.list.useQuery();
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  // 报价分组折叠状态：默认展开前两个供应商
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [claimedCode, setClaimedCode] = useState<string | null>(null);

  const visit = trpc.platform.visit.useMutation({
    onSuccess: (d) => window.open(d.url, "_blank", "noopener"),
  });
  const submitReview = trpc.review.create.useMutation({
    onSuccess: () => {
      toast.success("点评已发布");
      setContent("");
      utils.platform.detail.invalidate({ domain });
    },
    onError: (e) => toast.error(e.message),
  });
  const fav = trpc.platform.toggleFavorite.useMutation({
    onSuccess: () => utils.platform.detail.invalidate({ domain }),
  });
  const claim = trpc.skr.claim.useMutation({
    onSuccess: (r) => {
      setClaimedCode(r.code);
      utils.skr.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // 该站点进行中的发码活动
  const activeSkr = useMemo(
    () =>
      (skrActs ?? []).filter(
        (a) => a.status === "active" && a.platformId === data?.platform.id,
      ),
    [skrActs, data],
  );

  // 报价按供应商分组
  const priceGroups = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof prices>>();
    for (const pr of prices ?? []) {
      const arr = groups.get(pr.vendor) ?? [];
      arr.push(pr);
      groups.set(pr.vendor, arr);
    }
    // 组内按倍率升序（便宜在前），组间按最低倍率升序
    for (const arr of groups.values()) {
      arr.sort((a, b) => Number(a.ratio) - Number(b.ratio));
    }
    return [...groups.entries()].sort(
      (a, b) => Number(a[1][0]?.ratio ?? 0) - Number(b[1][0]?.ratio ?? 0),
    );
  }, [prices]);

  if (isLoading) return <Skeleton className="h-96 rounded-xl" />;
  if (!data) return <div className="text-center py-20 text-muted-foreground">站点不存在</div>;

  const p = data.platform;
  const testLabel = p.apiConfirmed ? "已实测" : p.status === "down" ? "尚未验证" : "持续监测";
  const testCls = p.apiConfirmed
    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : p.status === "down"
      ? "bg-muted text-muted-foreground"
      : "bg-sky-500/10 text-sky-600 dark:text-sky-400";

  const toggleGroup = (v: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      {/* 基本信息 */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">{p.name}</h1>
              <span className={`text-[11px] px-1.5 py-0.5 rounded ${testCls}`}>{testLabel}</span>
              <Badge variant="secondary" className="text-[11px]">{STAGE_LABEL[p.stage] ?? p.stage}</Badge>
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">{p.url}</div>
            <div className="flex gap-1.5 mt-3 flex-wrap">
              {p.vendors.map((v) => (
                <span key={v} className={`text-[11px] px-1.5 py-0.5 rounded ${vendorColor(v)}`}>{v}</span>
              ))}
              {p.tags.map((tg) => (
                <Badge key={tg} variant="secondary" className="text-[11px]">{tg}</Badge>
              ))}
            </div>
            {p.description && (
              <p className="text-sm text-muted-foreground mt-3 max-w-2xl">{p.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                isAuthenticated ? fav.mutate({ platformId: p.id }) : toast.error("请先登录")
              }
            >
              <Heart className={`w-4 h-4 mr-1 ${data.isFav ? "fill-rose-500 text-rose-500" : ""}`} />
              {data.isFav ? "已收藏" : "收藏"}
            </Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => visit.mutate({ platformId: p.id })}>
              <ExternalLink className="w-4 h-4 mr-1" /> 访问站点
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mt-6">
          {[
            { label: "近 7 天可用率", value: p.uptime7 != null ? `${p.uptime7.toFixed(1)}%` : "—", cls: "text-emerald-600" },
            { label: "30 天可用率", value: p.uptime != null ? `${p.uptime.toFixed(1)}%` : "—", cls: "text-emerald-600" },
            { label: "平均延迟", value: fmtLatency(p.avgLatency), cls: "" },
            { label: "模型覆盖", value: p.modelCount ? `${p.modelCount} 个` : "—", cls: "" },
            { label: "榜单评分", value: Number(p.score).toFixed(1), cls: "text-amber-500" },
            { label: "累计访问", value: String(p.visitCount), cls: "" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className={`text-lg font-bold ${s.cls}`}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>近 30 天运行状态</span>
            {p.lastProbeAt && (
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                最近检测 {timeAgo(p.lastProbeAt)}
                {p.lastProbeLatency != null && ` · ${fmtLatency(p.lastProbeLatency)}`}
              </span>
            )}
          </div>
          <UptimeBar days={p.daily} />
          {p.probes && p.probes.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">最近 {p.probes.length} 次探测</span>
              <span className="flex items-center gap-1">
                {p.probes.map((pr, i) => (
                  <span
                    key={i}
                    className={`w-2 h-2 rounded-sm ${PROBE_DOT[pr.status]}`}
                    title={`${pr.status}${pr.latencyMs != null ? ` ${pr.latencyMs}ms` : ""}`}
                  />
                ))}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 兑换码活动 */}
      {activeSkr.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Gift className="w-4 h-4 text-amber-500" /> 兑换码福利
          </h2>
          {activeSkr.map((a) => (
            <div key={a.id} className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-48">
                <div className="text-sm font-medium">{a.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  剩余 {Math.max(0, a.totalCodes - a.claimed)} / {a.totalCodes}
                  {a.minRegisterDays > 0 && ` · 需注册满 ${a.minRegisterDays} 天`}
                  {a.perUserLimit > 1 && ` · 每人限领 ${a.perUserLimit} 个`}
                </div>
              </div>
              <Button
                className="bg-amber-500 hover:bg-amber-600 text-white"
                disabled={claim.isPending}
                onClick={() =>
                  isAuthenticated ? claim.mutate({ activityId: a.id }) : toast.error("请先登录后领取")
                }
              >
                <Gift className="w-4 h-4 mr-1" /> 领取兑换码
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* 报价：按供应商分组，可折叠 */}
      {priceGroups.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-1">模型报价</h2>
          <p className="text-xs text-muted-foreground mb-3">
            按供应商分组，点击组名折叠/展开；倍率为相对官方价格的人民币倍率，花费为估算单次调用成本
          </p>
          <div className="space-y-2">
            {priceGroups.map(([vendor, rows], gi) => {
              // 默认展开前两组，点击切换（toggled 集合记录与默认相反的组）
              const visible = gi < 2 !== collapsed.has(vendor);
              return (
                <div key={vendor} className="rounded-lg border overflow-hidden">
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted/40 hover:bg-muted/70 transition-colors"
                    onClick={() => toggleGroup(vendor)}
                  >
                    {visible ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <span className={`text-[11px] px-1.5 py-0.5 rounded ${vendorColor(vendor)}`}>{vendor}</span>
                    <span className="text-xs text-muted-foreground">{rows.length} 个模型</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      最低 <b className="text-indigo-600 dark:text-indigo-400">{Number(rows[0]?.ratio ?? 0).toFixed(2)}x</b>
                    </span>
                  </button>
                  {visible && (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground text-xs">
                          <th className="px-3 py-1.5 font-medium">模型</th>
                          <th className="px-3 py-1.5 font-medium">价格组</th>
                          <th className="px-3 py-1.5 font-medium">倍率</th>
                          <th className="px-3 py-1.5 font-medium">短文花费</th>
                          <th className="px-3 py-1.5 font-medium">长文花费</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((pr) => (
                          <tr key={pr.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-3 py-2 font-mono text-xs">{pr.model}</td>
                            <td className="px-3 py-2 text-xs">{pr.groupName === "default" ? "缺省" : pr.groupName}</td>
                            <td className="px-3 py-2 font-semibold text-indigo-600 dark:text-indigo-400">
                              {Number(pr.ratio) === 0 ? "按次" : `${Number(pr.ratio).toFixed(4)}x`}
                            </td>
                            <td className="px-3 py-2">￥{Number(pr.shortCost).toFixed(3)}</td>
                            <td className="px-3 py-2">￥{Number(pr.longCost).toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 点评区 */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h2 className="font-semibold">用户点评（{data.reviewCount}）</h2>

        {isAuthenticated ? (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setRating(s)}>
                  <Star
                    className={`w-5 h-5 ${s <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
                  />
                </button>
              ))}
              <span className="text-sm text-muted-foreground ml-2">{rating} 星</span>
            </div>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="分享你的使用体验（稳定性、价格、客服等）…"
              rows={3}
            />
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={submitReview.isPending || content.trim().length < 5}
              onClick={() => submitReview.mutate({ platformId: p.id, rating, content })}
            >
              发布点评
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            <Button variant="link" onClick={() => navigate("/login")}>登录</Button>
            后即可发表点评
          </div>
        )}

        <div className="space-y-3">
          {data.reviews.length === 0 && (
            <div className="text-sm text-muted-foreground py-6 text-center">暂无点评，来抢沙发</div>
          )}
          {data.reviews.map((r) => (
            <div key={r.id} className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{r.userName ?? "匿名用户"}</span>
                <span className="flex">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-3.5 h-3.5 ${s <= r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
                    />
                  ))}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">{fmtDate(r.createdAt)}</span>
              </div>
              <p className="text-sm mt-2 text-foreground/90 whitespace-pre-wrap">{r.content}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 领取成功弹窗 */}
      <Dialog open={!!claimedCode} onOpenChange={() => setClaimedCode(null)}>
        <DialogContent className="max-w-sm text-center space-y-4">
          <DialogHeader><DialogTitle>领取成功</DialogTitle></DialogHeader>
          <div className="rounded-lg bg-muted p-4 font-mono text-lg tracking-wider select-all">
            {claimedCode}
          </div>
          <Button
            className="w-full bg-indigo-600 hover:bg-indigo-700"
            onClick={() => {
              if (claimedCode) navigator.clipboard.writeText(claimedCode).then(() => toast.success("已复制"));
            }}
          >
            <Copy className="w-4 h-4 mr-1" /> 复制兑换码
          </Button>
          <p className="text-xs text-muted-foreground">也可在「福利中心 → 我的兑换码」随时查看</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

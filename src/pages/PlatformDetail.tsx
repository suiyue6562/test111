import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ExternalLink, Star, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import UptimeBar from "@/components/UptimeBar";
import { fmtLatency, fmtDate, vendorColor } from "@/lib/format";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

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
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");

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

  if (isLoading) return <Skeleton className="h-96 rounded-xl" />;
  if (!data) return <div className="text-center py-20 text-muted-foreground">站点不存在</div>;

  const p = data.platform;

  return (
    <div className="space-y-5">
      {/* 基本信息 */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">{p.name}</h1>
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground">30 天可用率</div>
            <div className="text-lg font-bold text-emerald-600">{p.uptime != null ? `${p.uptime.toFixed(1)}%` : "—"}</div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground">平均延迟</div>
            <div className="text-lg font-bold">{fmtLatency(p.avgLatency)}</div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground">综合评分</div>
            <div className="text-lg font-bold text-amber-500">
              {data.avgRating != null ? `${data.avgRating} 分` : "暂无"}
            </div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground">累计访问</div>
            <div className="text-lg font-bold">{p.visitCount}</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs text-muted-foreground mb-1.5">近 30 天运行状态</div>
          <UptimeBar days={p.daily} />
        </div>
      </div>

      {/* 价格表 */}
      {prices && prices.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-3">模型价格（人民币倍率）</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2 font-medium">供应商</th>
                  <th className="p-2 font-medium">模型</th>
                  <th className="p-2 font-medium">价格组</th>
                  <th className="p-2 font-medium">倍率</th>
                  <th className="p-2 font-medium">短文花费</th>
                  <th className="p-2 font-medium">长文花费</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((pr) => (
                  <tr key={pr.id} className="border-b last:border-0">
                    <td className="p-2">{pr.vendor}</td>
                    <td className="p-2 font-mono text-xs">{pr.model}</td>
                    <td className="p-2">{pr.groupName === "default" ? "缺省" : pr.groupName}</td>
                    <td className="p-2 font-semibold text-indigo-600 dark:text-indigo-400">{Number(pr.ratio).toFixed(4)}x</td>
                    <td className="p-2">￥{Number(pr.shortCost).toFixed(3)}</td>
                    <td className="p-2">￥{Number(pr.longCost).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    </div>
  );
}

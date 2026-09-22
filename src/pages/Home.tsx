import { useNavigate } from "react-router";
import { ArrowRight, Sparkles, Megaphone, Trophy, Flame, Rocket, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import PlatformCard, { type CardPlatform } from "@/components/PlatformCard";
import AdBeacon from "@/components/AdBeacon";
import { trpc } from "@/providers/trpc";

function Section({
  icon: Icon,
  title,
  desc,
  items,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  items: CardPlatform[];
  tone: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${tone}`} />
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{desc}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((p) => (
          <PlatformCard key={p.id} platform={p} />
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { data, isLoading } = trpc.platform.homeFeed.useQuery();
  const { data: board } = trpc.pricing.lowestBoard.useQuery();

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            首页推荐
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            赞助优选 · 口碑优秀站 · 人气爆款 · 新站速递，完整筛选请前往综合筛选页。
          </p>
        </div>
        <Button
          className="rounded-full bg-indigo-600 hover:bg-indigo-700"
          onClick={() => navigate("/discover")}
        >
          进入综合筛选 <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* 1. 广告主：付费推广，明确打标 */}
          {data && data.ads.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Megaphone className="w-3.5 h-3.5 text-amber-500" />
                赞助推荐
                <span className="text-muted-foreground/60">· 以下为付费推广内容</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {data.ads.map((p) => (
                  <div key={p.id} className="relative">
                    <AdBeacon platformId={p.id} position="home" />
                    <Badge className="absolute -top-2 -right-2 z-10 bg-amber-500 hover:bg-amber-500 text-white shadow">
                      广告
                    </Badge>
                    <PlatformCard platform={p} adSource="ad-home" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. 优秀站：综合评分最高 */}
          <Section
            icon={Trophy}
            title="口碑优秀站"
            desc="可用率、延迟、用户评分综合最优"
            items={data?.excellent ?? []}
            tone="text-yellow-500"
          />

          {/* 3. 爆款站：近 7 天真实访问最多 */}
          <Section
            icon={Flame}
            title="人气爆款站"
            desc="近 7 天用户真实访问最多"
            items={data?.hot ?? []}
            tone="text-rose-500"
          />

          {/* 4. 新站速递：最新收录 */}
          <Section
            icon={Rocket}
            title="新站速递"
            desc="近 30 天新收录，值得关注"
            items={data?.newSites ?? []}
            tone="text-emerald-500"
          />

          {/* 5. 全网最低价：热门模型价格优势直出 */}
          {board && board.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Tags className="w-4 h-4 text-indigo-500" />
                <h2 className="text-base font-semibold">全网最低价</h2>
                <span className="text-xs text-muted-foreground">热门模型价格洼地，数据每小时更新</span>
                <Button
                  variant="link"
                  size="sm"
                  className="ml-auto text-xs"
                  onClick={() => navigate("/pricing")}
                >
                  查看完整比价 <ArrowRight className="w-3 h-3 ml-0.5" />
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {board.slice(0, 6).map((b) => (
                  <button
                    key={b.model}
                    className="rounded-xl border bg-card p-3.5 text-left hover:shadow-md transition-shadow"
                    onClick={() => navigate(`/site/${b.minDomain}`)}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-medium truncate">{b.model}</span>
                      <span className="text-[11px] text-muted-foreground ml-auto shrink-0">
                        {b.sellers} 站在售
                      </span>
                    </div>
                    <div className="flex items-end justify-between mt-2">
                      <span className="text-sm font-medium truncate">{b.minPlatformName}</span>
                      <span className="text-base font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                        {b.isRatio ? `${b.minEff.toFixed(2)}x` : `￥${b.minEff.toFixed(3)}/次`}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

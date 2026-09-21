import { useNavigate } from "react-router";
import { ArrowRight, Sparkles, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import PlatformCard from "@/components/PlatformCard";
import { trpc } from "@/providers/trpc";

export default function Home() {
  const navigate = useNavigate();
  const { data, isLoading } = trpc.platform.featured.useQuery();
  const { data: ads } = trpc.platform.adSlots.useQuery();

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            首页精选平台
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            首页仅展示精选概览，完整筛选与比对请前往综合筛选页。
          </p>
        </div>
        <Button
          className="rounded-full bg-indigo-600 hover:bg-indigo-700"
          onClick={() => navigate("/discover")}
        >
          进入综合筛选 <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {/* 赞助广告位：有投放时才显示，明确打标 */}
      {ads && ads.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Megaphone className="w-3.5 h-3.5 text-amber-500" />
            赞助推荐
            <span className="text-muted-foreground/60">· 以下为付费推广内容</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ads.map((p) => (
              <div key={p.id} className="relative">
                <Badge className="absolute -top-2 -right-2 z-10 bg-amber-500 hover:bg-amber-500 text-white shadow">
                  广告
                </Badge>
                <PlatformCard platform={p} />
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data?.map((p) => <PlatformCard key={p.id} platform={p} />)}
        </div>
      )}
    </div>
  );
}

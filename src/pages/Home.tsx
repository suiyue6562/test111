import { useNavigate } from "react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import PlatformCard from "@/components/PlatformCard";
import { trpc } from "@/providers/trpc";

export default function Home() {
  const navigate = useNavigate();
  const { data, isLoading } = trpc.platform.featured.useQuery();

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

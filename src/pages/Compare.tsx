import { useSearchParams, useNavigate } from "react-router";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import UptimeBar from "@/components/UptimeBar";
import { fmtLatency } from "@/lib/format";
import { trpc } from "@/providers/trpc";

export default function Compare() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ids = (params.get("ids") ?? "").split(",").map(Number).filter(Boolean);
  const { data, isLoading } = trpc.platform.compare.useQuery(
    { ids },
    { enabled: ids.length >= 2 },
  );
  const visit = trpc.platform.visit.useMutation({
    onSuccess: (d) => window.open(d.url, "_blank", "noopener"),
  });

  if (ids.length < 2) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        请先在综合筛选页选择至少 2 个平台
        <div className="mt-4">
          <Button onClick={() => navigate("/discover")}>前往综合筛选</Button>
        </div>
      </div>
    );
  }

  if (isLoading) return <Skeleton className="h-96 rounded-xl" />;

  const best = {
    uptime: Math.max(...(data ?? []).map((p) => p.uptime ?? -1)),
    latency: Math.min(...(data ?? []).map((p) => p.avgLatency ?? Infinity)),
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-lg font-bold">平台横向对比</h1>
          <p className="text-sm text-muted-foreground">共对比 {data?.length ?? 0} 个平台</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b">
              <th className="text-left p-4 text-muted-foreground font-medium w-32">项目</th>
              {data?.map((p) => (
                <th key={p.id} className="text-left p-4">
                  <button className="font-semibold hover:text-indigo-600" onClick={() => navigate(`/site/${p.domain}`)}>
                    {p.name}
                  </button>
                  <div className="text-xs text-muted-foreground font-normal">{p.domain}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="p-4 text-muted-foreground">供应商</td>
              {data?.map((p) => (
                <td key={p.id} className="p-4">{p.vendors.join(" / ")}</td>
              ))}
            </tr>
            <tr className="border-b">
              <td className="p-4 text-muted-foreground">30 天可用率</td>
              {data?.map((p) => (
                <td key={p.id} className={`p-4 ${p.uptime === best.uptime ? "text-emerald-600 font-semibold" : ""}`}>
                  {p.uptime != null ? `${p.uptime.toFixed(1)}%` : "—"}
                </td>
              ))}
            </tr>
            <tr className="border-b">
              <td className="p-4 text-muted-foreground">平均延迟</td>
              {data?.map((p) => (
                <td key={p.id} className={`p-4 ${p.avgLatency === best.latency ? "text-emerald-600 font-semibold" : ""}`}>
                  {fmtLatency(p.avgLatency)}
                </td>
              ))}
            </tr>
            <tr className="border-b">
              <td className="p-4 text-muted-foreground">30 天状态</td>
              {data?.map((p) => (
                <td key={p.id} className="p-4 min-w-40">
                  <UptimeBar days={p.daily} />
                </td>
              ))}
            </tr>
            <tr className="border-b">
              <td className="p-4 text-muted-foreground">简介</td>
              {data?.map((p) => (
                <td key={p.id} className="p-4 text-xs text-muted-foreground max-w-56">{p.description}</td>
              ))}
            </tr>
            <tr>
              <td className="p-4 text-muted-foreground">操作</td>
              {data?.map((p) => (
                <td key={p.id} className="p-4">
                  <Button size="sm" variant="outline" onClick={() => visit.mutate({ platformId: p.id })}>
                    <ExternalLink className="w-3.5 h-3.5 mr-1" /> 访问
                  </Button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

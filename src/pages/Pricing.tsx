import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowUpDown, ExternalLink, MessageSquarePlus, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { fmtLatency, vendorColor } from "@/lib/format";
import { toast } from "sonner";

type SortKey = "ratioAsc" | "ratioDesc" | "latencyAsc" | "uptimeDesc";

export default function Pricing() {
  const navigate = useNavigate();
  const { data: catalog } = trpc.pricing.catalog.useQuery();
  const [vendor, setVendor] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [groupName, setGroupName] = useState("default");
  const [sort, setSort] = useState<SortKey>("ratioAsc");
  const visit = trpc.platform.visit.useMutation({
    onSuccess: (d) => window.open(d.url, "_blank", "noopener"),
  });

  const vendors = useMemo(() => catalog?.map((c) => c.vendor) ?? [], [catalog]);
  const models = useMemo(
    () => catalog?.find((c) => c.vendor === vendor)?.models ?? [],
    [catalog, vendor],
  );

  useEffect(() => {
    if (!vendor && vendors.length > 0) setVendor(vendors[0]);
  }, [vendors, vendor]);
  useEffect(() => {
    if (models.length > 0 && !models.includes(model)) setModel(models[0]);
  }, [models, model]);

  const { data, isLoading } = trpc.pricing.table.useQuery(
    { vendor, model, groupName, sort },
    { enabled: !!vendor && !!model },
  );
  const { data: board, isLoading: boardLoading } = trpc.pricing.lowestBoard.useQuery();

  const sortBtn = (key: SortKey, label: string) => (
    <button
      className={`inline-flex items-center gap-1 ${sort === key ? "text-indigo-600 dark:text-indigo-400 font-medium" : "text-muted-foreground hover:text-foreground"}`}
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
          在售站点最多的热门模型及其全网最低价站点，点击模型可在下方工作台查看全部报价
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
                    className="font-mono text-xs font-medium hover:text-indigo-600 dark:hover:text-indigo-400 truncate"
                    title="在下方查看全部站点报价"
                    onClick={() => {
                      setVendor(b.vendor);
                      setModel(b.model);
                      document.getElementById("price-workbench")?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    {b.model}
                  </button>
                  <span className="text-[11px] text-muted-foreground ml-auto shrink-0">{b.sellers} 站在售</span>
                </div>
                <div className="flex items-end justify-between mt-2">
                  <div>
                    <button
                      className="text-sm font-medium hover:text-indigo-600 dark:hover:text-indigo-400"
                      onClick={() => navigate(`/site/${b.minDomain}`)}
                    >
                      {b.minPlatformName}
                    </button>
                    {b.minPlatformName !== b.minDomain && (
                      <div className="text-xs text-muted-foreground">{b.minDomain}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-indigo-600 dark:text-indigo-400">
                      {b.isRatio ? `${b.minEff.toFixed(2)}x` : `￥${b.minEff.toFixed(3)}/次`}
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

      {/* 价格筛选工作台 */}
      <div id="price-workbench" className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h1 className="text-lg font-bold">价格筛选</h1>
          <p className="text-sm text-muted-foreground">
            模型价格工作台 · 统一价格单位：实际人民币倍率（数据来自各站公开信息，仅供参考）
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground w-12">供应商</span>
          {vendors.map((v) => (
            <Button
              key={v}
              size="sm"
              variant={vendor === v ? "default" : "outline"}
              className={vendor === v ? "bg-indigo-600 hover:bg-indigo-700" : ""}
              onClick={() => setVendor(v)}
            >
              {v}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground w-12">模型</span>
          {models.map((m) => (
            <Button
              key={m}
              size="sm"
              variant={model === m ? "secondary" : "ghost"}
              className="border"
              onClick={() => setModel(m)}
            >
              {m}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground w-12">价格组</span>
          {["default", "vip"].map((g) => (
            <Button
              key={g}
              size="sm"
              variant={groupName === g ? "secondary" : "ghost"}
              className="border"
              onClick={() => setGroupName(g)}
            >
              {g === "default" ? "缺省用户组" : "VIP 组"}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <h2 className="font-semibold">{model}</h2>
        <span className="text-sm text-muted-foreground">
          共 <b className="text-foreground">{data?.total ?? "…"}</b> 个站点
        </span>
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b text-left">
              <th className="p-3 font-medium text-muted-foreground">站点名称</th>
              <th className="p-3 font-medium">{sortBtn("uptimeDesc", "SLA / 延迟")}</th>
              <th className="p-3 font-medium">{sortBtn(sort === "ratioAsc" ? "ratioDesc" : "ratioAsc", "实际人民币倍率")}</th>
              <th className="p-3 font-medium text-muted-foreground">预估短文花费</th>
              <th className="p-3 font-medium text-muted-foreground">预估长文花费</th>
              <th className="p-3 font-medium">{sortBtn("latencyAsc", "操作")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td className="p-3" colSpan={6}><Skeleton className="h-6" /></td>
                </tr>
              ))
            ) : data?.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-muted-foreground">
                  该模型在当前价格组下暂无站点数据
                </td>
              </tr>
            ) : (
              data?.items.map((it) => (
                <tr key={it.priceId} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="p-3">
                    <button
                      className="font-medium hover:text-indigo-600 dark:hover:text-indigo-400"
                      onClick={() => navigate(`/site/${it.domain}`)}
                    >
                      {it.name}
                    </button>
                    <div className="text-xs text-muted-foreground">{it.url}</div>
                  </td>
                  <td className="p-3">
                    <div>{it.uptime != null ? `${it.uptime.toFixed(1)}%` : "未知"}</div>
                    <div className="text-xs text-muted-foreground">{fmtLatency(it.avgLatency)}</div>
                  </td>
                  <td className="p-3 font-semibold text-indigo-600 dark:text-indigo-400">
                    {Number(it.ratio).toFixed(4)}x
                  </td>
                  <td className="p-3">￥{Number(it.shortCost).toFixed(3)} / 次</td>
                  <td className="p-3">￥{Number(it.longCost).toFixed(3)} / 次</td>
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
    </div>
  );
}

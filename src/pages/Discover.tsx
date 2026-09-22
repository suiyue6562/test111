import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Search, Scale, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import PlatformCard from "@/components/PlatformCard";
import AdBeacon from "@/components/AdBeacon";
import { trpc } from "@/providers/trpc";

const VENDORS = ["OpenAI", "Claude", "Gemini", "DeepSeek", "Qwen", "Kimi", "GLM", "MiniMax", "xAI"];
const STATUSES = [
  { v: "operational", label: "正常" },
  { v: "slow", label: "偏慢" },
  { v: "down", label: "异常" },
  { v: "unknown", label: "未知" },
];
const STAGES = [
  { v: "stable", label: "持续运营" },
  { v: "new", label: "新站收录" },
  { v: "watch", label: "观察中" },
  { v: "closed", label: "已关闭" },
];

export default function Discover() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [vendors, setVendors] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [sort, setSort] = useState<"default" | "uptime" | "latency" | "visits" | "newest">("default");
  const [page, setPage] = useState(1);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const navigate = useNavigate();

  const query = useMemo(
    () => ({
      search: params.get("q") ?? undefined,
      vendors: vendors.length ? vendors : undefined,
      status: statuses.length ? statuses : undefined,
      stage: stages.length ? stages : undefined,
      sort,
      page,
      pageSize: 24,
    }),
    [params, vendors, statuses, stages, sort, page],
  );

  const { data, isLoading } = trpc.platform.list.useQuery(query);

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) => {
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    setPage(1);
  };

  const doSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setParams(search ? { q: search } : {});
  };

  const toggleCompare = (id: number) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 6 ? [...prev, id] : prev,
    );
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 24)) : 1;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold">综合筛选工作台</h1>
            <p className="text-sm text-muted-foreground">平台搜索与多维度筛选</p>
          </div>
          <form onSubmit={doSearch} className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索平台名、域名、描述、模型…"
              className="w-full h-9 rounded-full border bg-background pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </form>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground w-14">供应商</span>
            {VENDORS.map((v) => (
              <Badge
                key={v}
                variant={vendors.includes(v) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggle(vendors, v, setVendors)}
              >
                {v}
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground w-14">状态</span>
            {STATUSES.map((s) => (
              <Badge
                key={s.v}
                variant={statuses.includes(s.v) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggle(statuses, s.v, setStatuses)}
              >
                {s.label}
              </Badge>
            ))}
            <span className="text-xs text-muted-foreground w-14 ml-4">阶段</span>
            {STAGES.map((s) => (
              <Badge
                key={s.v}
                variant={stages.includes(s.v) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggle(stages, s.v, setStages)}
              >
                {s.label}
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="w-36 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">默认排序</SelectItem>
                <SelectItem value="uptime">可用率最高</SelectItem>
                <SelectItem value="latency">延迟最低</SelectItem>
                <SelectItem value="visits">访问量最高</SelectItem>
                <SelectItem value="newest">最新收录</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* 对比栏 */}
      <div className="rounded-xl border bg-card p-4 flex items-center gap-3 flex-wrap">
        <Scale className="w-4 h-4 text-indigo-500" />
        <span className="text-sm font-medium">对比选择</span>
        <span className="text-sm text-muted-foreground">
          已选 <b className="text-indigo-600 dark:text-indigo-400">{compareIds.length}</b> 个平台（至少 2 个，最多 6 个）
        </span>
        <div className="flex-1" />
        {compareIds.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setCompareIds([])}>
            <X className="w-3.5 h-3.5 mr-1" /> 清空
          </Button>
        )}
        <Button
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700"
          disabled={compareIds.length < 2}
          onClick={() => navigate(`/compare?ids=${compareIds.join(",")}`)}
        >
          一键对比
        </Button>
      </div>

      <div className="text-sm text-muted-foreground">
        平台筛选结果 <b className="text-foreground text-base">{data?.total ?? "…"}</b> 个
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data?.items.map((p) => (
              <div key={p.id}>
                {p.adActive && sort === "default" && <AdBeacon platformId={p.id} position="list" />}
                <PlatformCard
                  platform={p}
                  compareMode
                  compared={compareIds.includes(p.id)}
                  onToggleCompare={toggleCompare}
                  adSource={p.adActive && sort === "default" ? "ad-list" : undefined}
                />
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                上一页
              </Button>
              <span className="text-sm text-muted-foreground self-center">
                {page} / {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                下一页
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

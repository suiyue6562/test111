import { useState } from "react";
import {
  Shield, Database, Users as UsersIcon, MessageSquare, Gift,
  UploadCloud, Star, Plus, Trash2, Pencil, Radar,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/format";

const VENDORS = ["OpenAI", "Claude", "Gemini", "DeepSeek", "Qwen", "Kimi", "GLM", "MiniMax", "xAI"];

function PlatformForm({
  initial, onSubmit, pending,
}: {
  initial?: {
    name: string; domain: string; url: string; apiBaseUrl: string | null;
    description: string | null; vendors: string[]; tags: string[];
    status: "operational" | "slow" | "down" | "unknown";
    stage: "new" | "stable" | "watch" | "closed"; featured: boolean;
    isAd: boolean; adWeight: number; adExpireAt: Date | string | null;
  } | null;
  onSubmit: (v: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const [f, setF] = useState({
    name: initial?.name ?? "",
    domain: initial?.domain ?? "",
    url: initial?.url ?? "",
    apiBaseUrl: initial?.apiBaseUrl ?? "",
    description: initial?.description ?? "",
    vendors: initial?.vendors ?? ([] as string[]),
    tags: (initial?.tags ?? []).join(","),
    status: initial?.status ?? ("unknown" as const),
    stage: initial?.stage ?? ("new" as const),
    featured: initial?.featured ?? false,
    isAd: initial?.isAd ?? false,
    adWeight: initial?.adWeight ?? 0,
    adExpireAt: initial?.adExpireAt
      ? new Date(initial.adExpireAt).toISOString().slice(0, 16)
      : "",
  });
  return (
    <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
      <Input placeholder="平台名称" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <Input placeholder="域名，如 api.example.com" value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} />
      <Input placeholder="网址 https://…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
      <Input placeholder="API 地址（可选，默认 网址/v1）" value={f.apiBaseUrl} onChange={(e) => setF({ ...f, apiBaseUrl: e.target.value })} />
      <Textarea placeholder="简介" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} />
      <div className="flex gap-1.5 flex-wrap">
        {VENDORS.map((v) => (
          <Badge
            key={v}
            variant={f.vendors.includes(v) ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() =>
              setF({ ...f, vendors: f.vendors.includes(v) ? f.vendors.filter((x) => x !== v) : [...f.vendors, v] })
            }
          >
            {v}
          </Badge>
        ))}
      </div>
      <Input placeholder="标签，逗号分隔" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
      <div className="grid grid-cols-3 gap-2">
        <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v as typeof f.status })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="operational">正常</SelectItem>
            <SelectItem value="slow">偏慢</SelectItem>
            <SelectItem value="down">异常</SelectItem>
            <SelectItem value="unknown">未知</SelectItem>
          </SelectContent>
        </Select>
        <Select value={f.stage} onValueChange={(v) => setF({ ...f, stage: v as typeof f.stage })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="new">新站收录</SelectItem>
            <SelectItem value="stable">持续运营</SelectItem>
            <SelectItem value="watch">观察中</SelectItem>
            <SelectItem value="closed">已关闭</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={f.featured ? "default" : "outline"}
          onClick={() => setF({ ...f, featured: !f.featured })}
        >
          {f.featured ? "已设为精选" : "设为精选"}
        </Button>
      </div>
      {/* 广告位设置 */}
      <div className="rounded-lg border border-dashed border-amber-500/40 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-amber-600 dark:text-amber-400">赞助广告位</span>
          <Button
            type="button"
            size="sm"
            variant={f.isAd ? "default" : "outline"}
            onClick={() => setF({ ...f, isAd: !f.isAd })}
          >
            {f.isAd ? "已开启广告位" : "开启广告位"}
          </Button>
        </div>
        {f.isAd && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">广告权重（越大越靠前）</label>
              <Input
                type="number"
                value={f.adWeight}
                onChange={(e) => setF({ ...f, adWeight: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">过期时间（留空 = 长期有效）</label>
              <Input
                type="datetime-local"
                value={f.adExpireAt}
                onChange={(e) => setF({ ...f, adExpireAt: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>
      <Button
        className="w-full bg-indigo-600 hover:bg-indigo-700"
        disabled={pending || !f.name || !f.domain || !f.url}
        onClick={() =>
          onSubmit({
            ...f,
            adExpireAt: f.adExpireAt ? new Date(f.adExpireAt).toISOString() : null,
            tags: f.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
          })
        }
      >
        保存
      </Button>
    </div>
  );
}

export default function Admin() {
  const { user, isLoading } = useAuth();
  const utils = trpc.useUtils();
  const { data: stats } = trpc.admin.stats.useQuery(undefined, { enabled: user?.role === "admin" });
  const { data: plats } = trpc.admin.listPlatforms.useQuery(undefined, { enabled: user?.role === "admin" });
  const { data: subs } = trpc.admin.listSubmissions.useQuery(undefined, { enabled: user?.role === "admin" });
  const { data: rvws } = trpc.admin.listReviews.useQuery(undefined, { enabled: user?.role === "admin" });
  const { data: posts } = trpc.admin.listPosts.useQuery(undefined, { enabled: user?.role === "admin" });
  const { data: acts } = trpc.admin.listActivities.useQuery(undefined, { enabled: user?.role === "admin" });
  const { data: usrs } = trpc.admin.listUsers.useQuery(undefined, { enabled: user?.role === "admin" });
  const { data: colOverview } = trpc.admin.collectorOverview.useQuery(undefined, {
    enabled: user?.role === "admin",
    refetchInterval: 60_000,
  });
  const { data: colTrend } = trpc.admin.collectorTrend.useQuery(undefined, { enabled: user?.role === "admin" });
  const { data: colRuns } = trpc.admin.collectorRuns.useQuery(undefined, {
    enabled: user?.role === "admin",
    refetchInterval: 60_000,
  });
  const { data: colDown } = trpc.admin.collectorDownSites.useQuery(undefined, { enabled: user?.role === "admin" });
  const { data: adStats } = trpc.admin.adStats.useQuery(undefined, {
    enabled: user?.role === "admin",
    refetchInterval: 60_000,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editPlat, setEditPlat] = useState<(typeof plats extends (infer T)[] | undefined ? T : never) | null>(null);
  const [pricePlat, setPricePlat] = useState<number | null>(null);
  const [actOpen, setActOpen] = useState(false);
  const [actForm, setActForm] = useState({ title: "", description: "", totalCodes: 50, perUserLimit: 1, minRegisterDays: 0, startAt: "", endAt: "", platformId: "" });
  const [priceForm, setPriceForm] = useState({ vendor: "OpenAI", model: "", groupName: "default", ratio: "", shortCost: "", longCost: "" });

  const invalidateAll = () => utils.admin.invalidate();

  const createPlat = trpc.admin.createPlatform.useMutation({
    onSuccess: () => { toast.success("已创建"); setEditOpen(false); invalidateAll(); utils.platform.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updatePlat = trpc.admin.updatePlatform.useMutation({
    onSuccess: () => { toast.success("已保存"); setEditOpen(false); invalidateAll(); utils.platform.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const delPlat = trpc.admin.deletePlatform.useMutation({
    onSuccess: () => { toast.success("已删除"); invalidateAll(); utils.platform.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const reviewSub = trpc.admin.reviewSubmission.useMutation({
    onSuccess: () => { toast.success("已处理"); invalidateAll(); utils.platform.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const setRv = trpc.admin.setReviewStatus.useMutation({ onSuccess: () => { invalidateAll(); toast.success("已更新"); } });
  const setPost = trpc.admin.setPostStatus.useMutation({ onSuccess: () => { invalidateAll(); toast.success("已更新"); } });
  const createAct = trpc.admin.createActivity.useMutation({
    onSuccess: () => { toast.success("活动已创建"); setActOpen(false); invalidateAll(); utils.skr.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const endAct = trpc.admin.endActivity.useMutation({ onSuccess: () => { invalidateAll(); toast.success("已结束"); } });
  const setUserStatus = trpc.admin.setUserStatus.useMutation({ onSuccess: () => { invalidateAll(); toast.success("已更新"); }, onError: (e) => toast.error(e.message) });
  const setUserRole = trpc.admin.setUserRole.useMutation({ onSuccess: () => { invalidateAll(); toast.success("已更新"); }, onError: (e) => toast.error(e.message) });
  const { data: platPrices } = trpc.admin.listPrices.useQuery(
    { platformId: pricePlat ?? 0 },
    { enabled: pricePlat != null },
  );
  const upsertPrice = trpc.admin.upsertPrice.useMutation({
    onSuccess: () => { toast.success("价格已保存"); if (pricePlat) utils.admin.listPrices.invalidate({ platformId: pricePlat }); utils.pricing.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const delPrice = trpc.admin.deletePrice.useMutation({
    onSuccess: () => { if (pricePlat) utils.admin.listPrices.invalidate({ platformId: pricePlat }); utils.pricing.invalidate(); },
  });

  if (isLoading) return <Skeleton className="h-96 rounded-xl" />;
  if (user?.role !== "admin") {
    return <div className="text-center py-20 text-muted-foreground">无权限访问管理后台</div>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-5">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-500" /> 管理后台
        </h1>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-4">
          {[
            { label: "收录平台", value: stats?.platforms, icon: Database },
            { label: "注册用户", value: stats?.users, icon: UsersIcon },
            { label: "点评数", value: stats?.reviews, icon: Star },
            { label: "帖子数", value: stats?.posts, icon: MessageSquare },
            { label: "待审申请", value: stats?.pendingSubmissions, icon: UploadCloud },
            { label: "进行中活动", value: stats?.activeActivities, icon: Gift },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <s.icon className="w-3 h-3" /> {s.label}
              </div>
              <div className="text-xl font-bold mt-1">{s.value ?? "…"}</div>
            </div>
          ))}
        </div>
      </div>

      <Tabs defaultValue="platforms">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="platforms">平台管理</TabsTrigger>
          <TabsTrigger value="subs">收录审核{stats ? `（${stats.pendingSubmissions}）` : ""}</TabsTrigger>
          <TabsTrigger value="reviews">点评管理</TabsTrigger>
          <TabsTrigger value="posts">帖子管理</TabsTrigger>
          <TabsTrigger value="acts">活动管理</TabsTrigger>
          <TabsTrigger value="users">用户管理</TabsTrigger>
          <TabsTrigger value="collector">采集监控</TabsTrigger>
          <TabsTrigger value="adstats">广告效果</TabsTrigger>
        </TabsList>

        {/* 平台管理 */}
        <TabsContent value="platforms" className="pt-4">
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">共 {plats?.length ?? 0} 个平台</span>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => { setEditPlat(null); setEditOpen(true); }}>
                <Plus className="w-4 h-4 mr-1" /> 新增平台
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead><TableHead>域名</TableHead><TableHead>状态</TableHead>
                    <TableHead>阶段</TableHead><TableHead>精选</TableHead><TableHead>广告</TableHead><TableHead>评分</TableHead><TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plats?.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.domain}</TableCell>
                      <TableCell>{{ operational: "正常", slow: "偏慢", down: "异常", unknown: "未知" }[p.status]}</TableCell>
                      <TableCell>{{ new: "新站收录", stable: "持续运营", watch: "观察中", closed: "已关闭" }[p.stage]}</TableCell>
                      <TableCell>{p.featured ? "⭐" : "—"}</TableCell>
                      <TableCell>
                        {p.isAd ? (
                          <Badge className="bg-amber-500/90 hover:bg-amber-500">权重 {p.adWeight}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{Number(p.score).toFixed(1)}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="outline" onClick={() => { setPricePlat(p.id); }}>价格</Button>
                        <Button size="sm" variant="outline" onClick={() => { setEditPlat(p); setEditOpen(true); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="destructive"
                          onClick={() => { if (confirm(`确定删除「${p.name}」？`)) delPlat.mutate({ id: p.id }); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* 收录审核 */}
        <TabsContent value="subs" className="pt-4">
          <div className="rounded-xl border bg-card p-4 space-y-2">
            {!subs?.length && <div className="text-sm text-muted-foreground py-8 text-center">暂无申请</div>}
            {subs?.map(({ sub, userName }) => (
              <div key={sub.id} className="rounded-lg border p-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{sub.url}</div>
                  <div className="text-xs text-muted-foreground">
                    申请人：{userName} · Key: {sub.apiKeyMasked} · {fmtDateTime(sub.createdAt)}
                  </div>
                </div>
                <Badge variant={sub.status === "approved" ? "default" : sub.status === "rejected" ? "destructive" : "secondary"}>
                  {sub.status === "pending" ? "待审核" : sub.status === "approved" ? "已通过" : "已拒绝"}
                </Badge>
                {sub.status === "pending" && (
                  <div className="flex gap-1.5">
                    <Button
                      size="sm" className="bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => {
                        const name = prompt("平台名称："); if (!name) return;
                        const domain = new URL(sub.url).hostname;
                        reviewSub.mutate({
                          id: sub.id, approve: true,
                          platform: { name, domain, url: sub.url, vendors: [], tags: [], status: "unknown", stage: "new", featured: false },
                        });
                      }}
                    >
                      通过并收录
                    </Button>
                    <Button
                      size="sm" variant="destructive"
                      onClick={() => { const note = prompt("拒绝原因（可选）：") ?? ""; reviewSub.mutate({ id: sub.id, approve: false, note }); }}
                    >
                      拒绝
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* 点评管理 */}
        <TabsContent value="reviews" className="pt-4">
          <div className="rounded-xl border bg-card p-4 space-y-2">
            {rvws?.map(({ review, userName, platformName }) => (
              <div key={review.id} className="rounded-lg border p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">
                    {userName} 点评 {platformName} · {"★".repeat(review.rating)} · {fmtDateTime(review.createdAt)}
                  </div>
                  <p className="text-sm mt-1">{review.content}</p>
                </div>
                <Button
                  size="sm" variant={review.status === "published" ? "destructive" : "outline"}
                  onClick={() => setRv.mutate({ id: review.id, status: review.status === "published" ? "hidden" : "published" })}
                >
                  {review.status === "published" ? "隐藏" : "恢复"}
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* 帖子管理 */}
        <TabsContent value="posts" className="pt-4">
          <div className="rounded-xl border bg-card p-4 space-y-2">
            {posts?.map(({ post, userName }) => (
              <div key={post.id} className="rounded-lg border p-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{post.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {userName} · {fmtDateTime(post.createdAt)} · {post.views} 阅读
                  </div>
                </div>
                <Button
                  size="sm" variant="outline"
                  onClick={() => setPost.mutate({ id: post.id, pinned: !post.pinned })}
                >
                  {post.pinned ? "取消置顶" : "置顶"}
                </Button>
                <Button
                  size="sm" variant={post.status === "published" ? "destructive" : "outline"}
                  onClick={() => setPost.mutate({ id: post.id, status: post.status === "published" ? "hidden" : "published" })}
                >
                  {post.status === "published" ? "隐藏" : "恢复"}
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* 活动管理 */}
        <TabsContent value="acts" className="pt-4">
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">共 {acts?.length ?? 0} 个活动</span>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setActOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> 创建活动
              </Button>
            </div>
            {acts?.map((a) => (
              <div key={a.id} className="rounded-lg border p-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground">
                    库存 {a.codeCount} · 已领 {a.claimed} · 开始 {fmtDateTime(a.startAt)}
                  </div>
                </div>
                <Badge variant={a.status === "active" ? "default" : "secondary"}>
                  {{ active: "进行中", scheduled: "未开始", ended: "已结束" }[a.status]}
                </Badge>
                {a.status !== "ended" && (
                  <Button size="sm" variant="destructive" onClick={() => endAct.mutate({ id: a.id })}>结束</Button>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* 用户管理 */}
        <TabsContent value="users" className="pt-4">
          <div className="rounded-xl border bg-card p-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户名</TableHead><TableHead>角色</TableHead><TableHead>状态</TableHead>
                  <TableHead>注册时间</TableHead><TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usrs?.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell>{u.role === "admin" ? "管理员" : "用户"}</TableCell>
                    <TableCell>{u.status === "active" ? "正常" : "已封禁"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDateTime(u.createdAt)}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="outline" onClick={() => setUserRole.mutate({ id: u.id, role: u.role === "admin" ? "user" : "admin" })}>
                        {u.role === "admin" ? "降为用户" : "设为管理员"}
                      </Button>
                      <Button size="sm" variant={u.status === "active" ? "destructive" : "outline"} onClick={() => setUserStatus.mutate({ id: u.id, status: u.status === "active" ? "banned" : "active" })}>
                        {u.status === "active" ? "封禁" : "解封"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* 采集监控 */}
        <TabsContent value="collector" className="pt-4 space-y-4">
          {/* 状态总览卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { label: "正常站点", value: colOverview?.statusDist.operational, cls: "text-emerald-500" },
              { label: "偏慢", value: colOverview?.statusDist.slow, cls: "text-amber-500" },
              { label: "故障", value: colOverview?.statusDist.down, cls: "text-red-500" },
              { label: "API 未确认", value: colOverview?.statusDist.unknown, cls: "text-muted-foreground" },
              { label: "价格记录", value: colOverview?.priceTotal, cls: "text-indigo-500" },
              { label: "覆盖站点", value: colOverview?.priceSites, cls: "text-indigo-500" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border bg-card p-3">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className={`text-xl font-bold mt-1 ${s.cls}`}>{s.value ?? "…"}</div>
              </div>
            ))}
          </div>

          {/* 最近运行时间 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
              <Radar className="w-5 h-5 text-indigo-500 shrink-0" />
              <div>
                <div className="text-sm font-medium">站点探测（每小时）</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {colOverview?.lastProbe
                    ? `最近一轮：${fmtDateTime(colOverview.lastProbe.startedAt)} · ${colOverview.lastProbe.finishedAt ? colOverview.lastProbe.detail : "进行中…"}`
                    : "暂无记录（采集器重启后自动开始）"}
                </div>
              </div>
            </div>
            <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
              <Database className="w-5 h-5 text-indigo-500 shrink-0" />
              <div>
                <div className="text-sm font-medium">价格采集（每 24 小时）</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {colOverview?.lastPricing
                    ? `最近一轮：${fmtDateTime(colOverview.lastPricing.startedAt)} · ${colOverview.lastPricing.finishedAt ? colOverview.lastPricing.detail : "进行中…"}`
                    : "暂无记录"}
                </div>
              </div>
            </div>
          </div>

          {/* 14 天趋势图 */}
          <div className="rounded-xl border bg-card p-4">
            <div className="text-sm font-medium mb-3">近 14 天站点状态趋势</div>
            {colTrend && colTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={colTrend}>
                  <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="ok" name="正常" stackId="a" fill="#10b981" />
                  <Bar dataKey="slow" name="偏慢" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="down" name="故障" stackId="a" fill="#ef4444" />
                  <Bar dataKey="nodata" name="未确认" stackId="a" fill="#94a3b8" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-sm text-muted-foreground py-10 text-center">暂无趋势数据</div>
            )}
          </div>

          {/* 运行记录 */}
          <div className="rounded-xl border bg-card p-4 overflow-x-auto">
            <div className="text-sm font-medium mb-3">最近运行记录</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>类型</TableHead><TableHead>开始时间</TableHead><TableHead>耗时</TableHead>
                  <TableHead>站点数</TableHead><TableHead>成功</TableHead><TableHead>失败</TableHead><TableHead>摘要</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {colRuns?.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant={r.type === "probe" ? "default" : "secondary"}>
                        {r.type === "probe" ? "探测" : "价格"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDateTime(r.startedAt)}</TableCell>
                    <TableCell className="text-xs">
                      {r.finishedAt
                        ? `${Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000)}s`
                        : "进行中"}
                    </TableCell>
                    <TableCell>{r.total}</TableCell>
                    <TableCell className="text-emerald-500">{r.okCount}</TableCell>
                    <TableCell className="text-red-500">{r.failCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.detail}</TableCell>
                  </TableRow>
                ))}
                {(!colRuns || colRuns.length === 0) && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">暂无运行记录</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* 故障站点 */}
          <div className="rounded-xl border bg-card p-4 overflow-x-auto">
            <div className="text-sm font-medium mb-3">
              故障 / 未确认站点（{colDown?.length ?? 0}）
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead><TableHead>域名</TableHead><TableHead>当前状态</TableHead>
                  <TableHead>今日探测</TableHead><TableHead>延迟</TableHead><TableHead>评分</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {colDown?.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.domain}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "down" ? "destructive" : "outline"}>
                        {p.status === "down" ? "故障" : "未确认"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.todayStatus === "ok" ? "正常" : p.todayStatus === "slow" ? "偏慢" : p.todayStatus === "down" ? "故障" : "无数据"}
                    </TableCell>
                    <TableCell className="text-xs">{p.todayLatency != null ? `${p.todayLatency}ms` : "-"}</TableCell>
                    <TableCell className="text-xs">{Number(p.score).toFixed(1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* 广告效果 */}
        <TabsContent value="adstats" className="pt-4 space-y-4">
          <div className="rounded-xl border bg-card p-4 overflow-x-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">广告投放效果（曝光 / 点击 / 点击率）</div>
              <div className="text-xs text-muted-foreground">每分钟自动刷新 · CTR = 点击 ÷ 曝光</div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>站点</TableHead>
                  <TableHead>投放状态</TableHead>
                  <TableHead>权重</TableHead>
                  <TableHead>7天曝光</TableHead>
                  <TableHead>7天点击</TableHead>
                  <TableHead>7天CTR</TableHead>
                  <TableHead>总曝光（首页/筛选）</TableHead>
                  <TableHead>总点击</TableHead>
                  <TableHead>总CTR</TableHead>
                  <TableHead>过期时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adStats?.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs text-muted-foreground">{a.domain}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={a.adLive ? "default" : "secondary"}>
                        {a.adLive ? "投放中" : "已过期"}
                      </Badge>
                    </TableCell>
                    <TableCell>{a.adWeight}</TableCell>
                    <TableCell>{a.imp7}</TableCell>
                    <TableCell className="text-indigo-500">{a.clk7}</TableCell>
                    <TableCell className="font-semibold text-emerald-500">
                      {a.ctr7 != null ? `${a.ctr7}%` : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.impTotal}（{a.impHome} / {a.impList}）
                    </TableCell>
                    <TableCell>{a.clkTotal}</TableCell>
                    <TableCell className="font-semibold">
                      {a.ctrTotal != null ? `${a.ctrTotal}%` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.adExpireAt ? fmtDateTime(a.adExpireAt) : "长期"}
                    </TableCell>
                  </TableRow>
                ))}
                {(!adStats || adStats.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      暂无投放中的广告位。到「平台管理 → 编辑站点 → 开启赞助广告位」即可开始投放。
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* 平台编辑弹窗 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editPlat ? "编辑平台" : "新增平台"}</DialogTitle></DialogHeader>
          <PlatformForm
            initial={editPlat ?? undefined}
            pending={createPlat.isPending || updatePlat.isPending}
            onSubmit={(v) => {
              const data = v as Parameters<typeof createPlat.mutate>[0];
              if (editPlat) updatePlat.mutate({ ...data, id: editPlat.id });
              else createPlat.mutate(data);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* 价格管理弹窗 */}
      <Dialog open={pricePlat != null} onOpenChange={(o) => !o && setPricePlat(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>价格管理</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[65vh] overflow-y-auto">
            <div className="grid grid-cols-6 gap-2">
              <Select value={priceForm.vendor} onValueChange={(v) => setPriceForm({ ...priceForm, vendor: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{VENDORS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="模型" value={priceForm.model} onChange={(e) => setPriceForm({ ...priceForm, model: e.target.value })} />
              <Select value={priceForm.groupName} onValueChange={(v) => setPriceForm({ ...priceForm, groupName: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">缺省组</SelectItem>
                  <SelectItem value="vip">VIP 组</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="倍率 0.15" value={priceForm.ratio} onChange={(e) => setPriceForm({ ...priceForm, ratio: e.target.value })} />
              <Input placeholder="短文 0.02" value={priceForm.shortCost} onChange={(e) => setPriceForm({ ...priceForm, shortCost: e.target.value })} />
              <Input placeholder="长文 0.15" value={priceForm.longCost} onChange={(e) => setPriceForm({ ...priceForm, longCost: e.target.value })} />
            </div>
            <Button
              size="sm" className="bg-indigo-600 hover:bg-indigo-700"
              disabled={upsertPrice.isPending || !priceForm.model || !priceForm.ratio}
              onClick={() => {
                if (!pricePlat) return;
                upsertPrice.mutate({
                  platformId: pricePlat,
                  vendor: priceForm.vendor, model: priceForm.model,
                  groupName: priceForm.groupName,
                  ratio: priceForm.ratio, shortCost: priceForm.shortCost || "0", longCost: priceForm.longCost || "0",
                });
                setPriceForm({ ...priceForm, model: "", ratio: "", shortCost: "", longCost: "" });
              }}
            >
              添加价格
            </Button>
            <Table>
              <TableHeader>
                <TableRow><TableHead>供应商</TableHead><TableHead>模型</TableHead><TableHead>组</TableHead><TableHead>倍率</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {platPrices?.map((pr) => (
                  <TableRow key={pr.id}>
                    <TableCell>{pr.vendor}</TableCell>
                    <TableCell className="font-mono text-xs">{pr.model}</TableCell>
                    <TableCell>{pr.groupName}</TableCell>
                    <TableCell>{Number(pr.ratio).toFixed(4)}x</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="destructive" onClick={() => delPrice.mutate({ id: pr.id })}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* 创建活动弹窗 */}
      <Dialog open={actOpen} onOpenChange={setActOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>创建发码活动</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="活动标题" value={actForm.title} onChange={(e) => setActForm({ ...actForm, title: e.target.value })} />
            <Textarea placeholder="活动说明" rows={2} value={actForm.description} onChange={(e) => setActForm({ ...actForm, description: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">码数量</label>
                <Input type="number" value={actForm.totalCodes} onChange={(e) => setActForm({ ...actForm, totalCodes: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">单用户限额</label>
                <Input type="number" value={actForm.perUserLimit} onChange={(e) => setActForm({ ...actForm, perUserLimit: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">最少注册天数</label>
                <Input type="number" value={actForm.minRegisterDays} onChange={(e) => setActForm({ ...actForm, minRegisterDays: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">开始时间</label>
                <Input type="datetime-local" value={actForm.startAt} onChange={(e) => setActForm({ ...actForm, startAt: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">结束时间（可选）</label>
                <Input type="datetime-local" value={actForm.endAt} onChange={(e) => setActForm({ ...actForm, endAt: e.target.value })} />
              </div>
            </div>
            <Select value={actForm.platformId} onValueChange={(v) => setActForm({ ...actForm, platformId: v })}>
              <SelectTrigger><SelectValue placeholder="关联站点（可选）" /></SelectTrigger>
              <SelectContent>
                {plats?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              disabled={createAct.isPending || actForm.title.length < 2 || !actForm.startAt}
              onClick={() =>
                createAct.mutate({
                  title: actForm.title,
                  description: actForm.description,
                  totalCodes: actForm.totalCodes,
                  perUserLimit: actForm.perUserLimit,
                  minRegisterDays: actForm.minRegisterDays,
                  startAt: new Date(actForm.startAt).toISOString(),
                  endAt: actForm.endAt ? new Date(actForm.endAt).toISOString() : undefined,
                  platformId: actForm.platformId ? Number(actForm.platformId) : undefined,
                })
              }
            >
              创建并生成兑换码
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

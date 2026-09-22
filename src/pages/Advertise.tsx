import { useState } from "react";
import {
  Megaphone, Monitor, PanelBottom, PanelLeft, PanelRight, AppWindow,
  LayoutGrid, ListFilter, Users, MousePointerClick, Database, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";

const ZONES = [
  { key: "home", name: "首页赞助推荐", icon: LayoutGrid, desc: "首页顶部黄金卡片位，进站第一眼" },
  { key: "list", name: "筛选页置顶", icon: ListFilter, desc: "综合筛选结果顶部，带广告标识" },
  { key: "top", name: "顶部横幅", icon: Monitor, desc: "全站所有页面顶部横条" },
  { key: "bottom", name: "底部横幅", icon: PanelBottom, desc: "全站所有页面底部横条" },
  { key: "left", name: "左侧栏", icon: PanelLeft, desc: "宽屏左侧悬浮卡片" },
  { key: "right", name: "右侧栏", icon: PanelRight, desc: "宽屏右侧悬浮卡片" },
  { key: "popup", name: "进站弹窗", icon: AppWindow, desc: "每位访客每会话一次，强制曝光" },
] as const;

export default function Advertise() {
  const { data, isLoading } = trpc.platform.adPublicStats.useQuery();
  const [form, setForm] = useState({ name: "", contact: "", positions: [] as string[], message: "" });
  const [done, setDone] = useState(false);

  const submit = trpc.platform.submitAdInquiry.useMutation({
    onSuccess: () => {
      setDone(true);
      toast.success("申请已提交，我们会尽快联系你");
    },
    onError: (e) => toast.error(e.message),
  });

  const togglePos = (k: string) =>
    setForm((f) => ({
      ...f,
      positions: f.positions.includes(k) ? f.positions.filter((x) => x !== k) : [...f.positions, k],
    }));

  const zoneStat = (k: string) => data?.zones.find((z) => z.position === k);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Hero */}
      <div className="rounded-xl border bg-gradient-to-br from-indigo-500/10 via-card to-amber-500/10 p-8 text-center space-y-3">
        <div className="flex justify-center">
          <Megaphone className="w-10 h-10 text-amber-500" />
        </div>
        <h1 className="text-2xl font-bold">广告投放合作</h1>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto">
          apibuy.top 是中转站导航与评测平台，汇聚精准的中高端 API 用户。7 个广告位全站覆盖，曝光、点击、转化率全量透明可查。
        </p>
        <div className="flex justify-center gap-8 pt-2">
          {[
            { label: "收录站点", value: data?.platforms, icon: Database },
            { label: "注册用户", value: data?.users, icon: Users },
            { label: "7天访问点击", value: data?.visits7d, icon: MousePointerClick },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                {isLoading ? "…" : s.value}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1 justify-center">
                <s.icon className="w-3 h-3" /> {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 广告位清单 */}
      <div>
        <h2 className="text-lg font-bold mb-1">广告位与实时数据</h2>
        <p className="text-xs text-muted-foreground mb-3">曝光与点击为近 7 天真实数据，每小时更新</p>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ZONES.map((z) => {
              const st = zoneStat(z.key);
              const full = st ? st.occupied >= st.capacity : false;
              return (
                <div key={z.key} className="rounded-xl border bg-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold">
                      <z.icon className="w-4 h-4 text-indigo-500" /> {z.name}
                    </div>
                    <Badge variant={full ? "secondary" : "default"} className={full ? "" : "bg-emerald-600 hover:bg-emerald-600"}>
                      {full ? "已满" : `空闲 ${st ? st.capacity - st.occupied : ""}/${st?.capacity ?? ""}`}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{z.desc}</div>
                  <div className="flex gap-4 text-xs pt-1">
                    <span>7天曝光 <b className="text-foreground">{st?.imp7 ?? 0}</b></span>
                    <span>7天点击 <b className="text-foreground">{st?.clk7 ?? 0}</b></span>
                    <span>
                      CTR{" "}
                      <b className="text-emerald-500">
                        {st && st.imp7 > 0 ? `${((st.clk7 / st.imp7) * 100).toFixed(1)}%` : "—"}
                      </b>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 合作流程 */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-lg font-bold mb-3">合作流程</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          {[
            { n: "1", t: "提交申请", d: "填写下方表单，注明意向位置与预算" },
            { n: "2", t: "商务洽谈", d: "1 个工作日内联系你，确认排期与价格" },
            { n: "3", t: "上线投放", d: "素材确认后即时上线，后台实时查看效果数据" },
          ].map((s) => (
            <div key={s.n} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shrink-0">
                {s.n}
              </div>
              <div>
                <div className="font-medium">{s.t}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 申请表单 */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h2 className="text-lg font-bold">投放申请</h2>
        {done ? (
          <div className="flex items-center gap-2 text-emerald-500 py-6 justify-center">
            <CheckCircle2 className="w-5 h-5" /> 申请已提交，我们会在 1 个工作日内联系你
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                placeholder="站点 / 品牌名称 *"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Input
                placeholder="联系方式（QQ / Telegram / 邮箱）*"
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">意向位置（可多选）*</div>
              <div className="flex gap-1.5 flex-wrap">
                {ZONES.map((z) => (
                  <Badge
                    key={z.key}
                    variant={form.positions.includes(z.key) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => togglePos(z.key)}
                  >
                    {z.name}
                  </Badge>
                ))}
              </div>
            </div>
            <Textarea
              placeholder="补充说明：预算、投放周期、素材链接等（可选）"
              rows={3}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
            <Button
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              disabled={submit.isPending || !form.name || form.contact.length < 3 || form.positions.length === 0}
              onClick={() =>
                submit.mutate({
                  name: form.name,
                  contact: form.contact,
                  positions: form.positions as ("home" | "list" | "top" | "bottom" | "left" | "right" | "popup")[],
                  message: form.message || undefined,
                })
              }
            >
              提交投放申请
            </Button>
          </>
        )}
        <p className="text-[11px] text-muted-foreground/70 text-center">
          本站服务范围不包括中国大陆地区；投放内容须符合适用法律及平台要求，详见风险声明。
        </p>
      </div>
    </div>
  );
}

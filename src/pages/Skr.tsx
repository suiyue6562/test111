import { Gift, Clock, Users, Package } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/format";

const STATUS_META = {
  scheduled: { label: "未开始", cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  active: { label: "进行中", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  ended: { label: "已结束", cls: "bg-muted text-muted-foreground" },
} as const;

export default function Skr() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.skr.list.useQuery();

  const claim = trpc.skr.claim.useMutation({
    onSuccess: (r) => {
      toast.success(`领取成功！兑换码：${r.code}`, { duration: 10000 });
      utils.skr.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const active = data?.filter((a) => a.status === "active").length ?? 0;
  const totalCodes = data?.reduce((s, a) => s + a.totalCodes, 0) ?? 0;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-5 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Gift className="w-5 h-5 text-orange-500" /> 发码活动
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            各站长发放的兑换码福利，先到先得
          </p>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div>活动总数 <b className="text-lg">{data?.length ?? 0}</b></div>
          <div>进行中 <b className="text-lg text-emerald-600">{active}</b></div>
          <div>总码量 <b className="text-lg text-orange-600 dark:text-orange-400">{totalCodes}</b></div>
          {isAuthenticated && (
            <Button variant="outline" onClick={() => navigate("/skr/my")}>
              <Package className="w-4 h-4 mr-1" /> 我的码包
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {data?.map((a) => {
            const sm = STATUS_META[a.status];
            const pct = a.totalCodes > 0 ? (a.claimed / a.totalCodes) * 100 : 0;
            return (
              <div key={a.id} className="rounded-xl border bg-card p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{a.title}</h3>
                    {a.platformName && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        关联站点：{a.platformName}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded shrink-0 ${sm.cls}`}>{sm.label}</span>
                </div>
                {a.description && (
                  <p className="text-sm text-muted-foreground">{a.description}</p>
                )}
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" /> 发布者：{a.creatorName ?? "官方"}
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">总库存 / 已发</span>
                    <span>{a.totalCodes} / {a.claimed}</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>参加要求：注册满 {a.minRegisterDays} 天</div>
                  <div>单用户限额：{a.perUserLimit} 次</div>
                  <div className="col-span-2 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> 发码时间：{fmtDateTime(a.startAt)}
                  </div>
                </div>
                <Button
                  className="w-full bg-orange-600 hover:bg-orange-700"
                  disabled={a.status !== "active" || claim.isPending}
                  onClick={() =>
                    isAuthenticated
                      ? claim.mutate({ activityId: a.id })
                      : navigate("/login")
                  }
                >
                  {!isAuthenticated
                    ? "登录后领取"
                    : a.status === "active"
                      ? "立即领取"
                      : a.status === "scheduled"
                        ? "未开始"
                        : "已结束"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

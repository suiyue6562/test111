import { useState } from "react";
import { useNavigate } from "react-router";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/format";

const STATUS_META = {
  pending: { label: "审核中", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  approved: { label: "已收录", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  rejected: { label: "未通过", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
} as const;

export default function Sks() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const { data: mySubs } = trpc.sks.my.useQuery(undefined, { enabled: isAuthenticated });

  const submit = trpc.sks.submit.useMutation({
    onSuccess: () => {
      toast.success("提交成功，等待管理员审核");
      setUrl("");
      setApiKey("");
      utils.sks.my.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const approved = mySubs?.filter((s) => s.status === "approved").length ?? 0;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-orange-500" /> 收录申请 · 站点提交
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            提交你的 API 中转站，审核通过后将收录入库并开启运行状态监控。
          </p>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
          <li>强烈建议新建一个额度很低的 Key 用于申请，平台仅做最低程度的可用性验证。</li>
          <li>收录后系统会每日记录站点可用状态与延迟，并生成对比数据。</li>
          <li>请勿提交涉嫌欺诈或跑路的站点，一经发现将永久拉黑。</li>
        </ul>

        {isAuthenticated ? (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">站点网址</label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.example.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">API Key</label>
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                type="password"
              />
            </div>
            <Button
              className="bg-orange-600 hover:bg-orange-700"
              disabled={submit.isPending || !url || apiKey.length < 8}
              onClick={() => submit.mutate({ url, apiKey })}
            >
              {submit.isPending ? "提交中…" : "提交申请"}
            </Button>
          </div>
        ) : (
          <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => navigate("/login")}>
            请先登录后再提交
          </Button>
        )}
      </div>

      {isAuthenticated && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center gap-6">
            <h2 className="font-semibold">我的申请</h2>
            <div className="text-sm text-muted-foreground">
              已收录 <b className="text-emerald-600">{approved}</b> · 共 {mySubs?.length ?? 0} 条
            </div>
          </div>
          {!mySubs?.length ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              你还没有申请过站点，提交成功后会在这里展示。
            </div>
          ) : (
            <div className="space-y-2">
              {mySubs.map((s) => {
                const sm = STATUS_META[s.status];
                return (
                  <div key={s.id} className="rounded-lg border p-3 flex items-center gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{s.url}</div>
                      <div className="text-xs text-muted-foreground">
                        Key: {s.apiKeyMasked} · 提交于 {fmtDateTime(s.createdAt)}
                        {s.reviewNote && ` · 备注：${s.reviewNote}`}
                      </div>
                    </div>
                    {s.platformName && (
                      <span className="text-xs text-muted-foreground">收录为：{s.platformName}</span>
                    )}
                    <span className={`text-xs px-2 py-1 rounded ${sm.cls}`}>{sm.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

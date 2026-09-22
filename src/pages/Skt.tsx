import { useState } from "react";
import { KeyRound, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/providers/trpc";
import { fmtLatency } from "@/lib/format";

interface TestResult {
  ok: boolean;
  verified?: boolean;
  noAuth?: boolean;
  latencyMs: number;
  httpStatus?: number;
  modelCount?: number;
  models?: string[];
  quota?: { hardLimitUsd: number } | null;
  message: string;
}

export default function Skt() {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);

  const test = trpc.skt.test.useMutation({
    onSuccess: (r) => setResult(r),
    onError: (e) => setResult({ ok: false, latencyMs: 0, message: e.message }),
  });

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-indigo-500" /> SKT · Key 可用性检测
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            输入任意中转站的 API 地址与 Key，实时检测连通性、延迟与可用模型列表。
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium mb-1.5 block">API 地址（Base URL）</label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
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
        </div>
        <Button
          className="bg-indigo-600 hover:bg-indigo-700"
          disabled={test.isPending || baseUrl.length < 4 || apiKey.length < 3}
          onClick={() => {
            setResult(null);
            test.mutate({ baseUrl, apiKey });
          }}
        >
          {test.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" /> 检测中…
            </>
          ) : (
            "开始检测"
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          检测会请求 /models 与额度查询接口（双请求对比验证），不会消耗你的对话额度。Key 不会被保存。
        </p>
      </div>

      {result && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            {result.ok ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            ) : (
              <XCircle className="w-6 h-6 text-rose-500" />
            )}
            <div>
              <div className="font-semibold">{result.ok ? "检测通过" : "检测失败"}</div>
              <div className="text-sm text-muted-foreground">{result.message}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-lg font-bold">{fmtLatency(result.latencyMs)}</div>
              <div className="text-xs text-muted-foreground">响应延迟</div>
            </div>
          </div>
          {/* 验证状态 */}
          <div className="flex items-center gap-2 flex-wrap">
            {result.ok && result.verified && (
              <Badge className="bg-emerald-600 hover:bg-emerald-600">已验证 Key 有效</Badge>
            )}
            {result.ok && result.noAuth && (
              <Badge className="bg-amber-500 hover:bg-amber-500">免鉴权站点 · Key 未经验证</Badge>
            )}
            {!result.ok && result.verified && (
              <Badge variant="destructive">Key 确认无效</Badge>
            )}
            {result.httpStatus != null && (
              <Badge variant="outline" className="font-mono">HTTP {result.httpStatus}</Badge>
            )}
            {result.quota && (
              <Badge variant="secondary">
                账户额度 ${result.quota.hardLimitUsd.toFixed(2)}
              </Badge>
            )}
          </div>
          {result.ok && (
            <>
              <div className="text-sm">
                可用模型 <b className="text-indigo-600 dark:text-indigo-400">{result.modelCount}</b> 个
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {result.models?.map((m) => (
                  <Badge key={m} variant="secondary" className="font-mono text-[11px]">
                    {m}
                  </Badge>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

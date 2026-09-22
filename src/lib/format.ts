export function fmtLatency(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

export function fmtUptime(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`;
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}/${p(dt.getMonth() + 1)}/${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

export function timeAgo(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - dt.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} 天前`;
  return fmtDate(dt);
}

export const VENDOR_COLORS: Record<string, string> = {
  OpenAI: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  Claude: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  Gemini: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  DeepSeek: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  Qwen: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  Kimi: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  GLM: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  MiniMax: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  xAI: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
};

export function vendorColor(v: string): string {
  return VENDOR_COLORS[v] ?? "bg-muted text-muted-foreground";
}

/** 只展示 AI 生成的决策版简介；隐藏导入期的模板简介（含「数据来源：」或「收录自」开头） */
export function aiSummary(desc: string | null | undefined): string | null {
  if (!desc) return null;
  if (desc.includes("数据来源：") || desc.startsWith("收录自")) return null;
  return desc;
}

/** 过滤不合规/高风险等导入期标记标签，不在前台展示 */
export function visibleTags(tags: string[] | null | undefined): string[] {
  return (tags ?? []).filter((t) => !/合规|高风险/.test(t));
}

/** 倍率显示：去掉多余的 0（0.5000 → 0.5，2 → 2） */
export function fmtRatio(r: number | string | null | undefined): string {
  if (r == null) return "—";
  const n = Number(r);
  if (!Number.isFinite(n)) return "—";
  return String(parseFloat(n.toFixed(4)));
}

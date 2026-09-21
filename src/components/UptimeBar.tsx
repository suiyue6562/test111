import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fmtLatency } from "@/lib/format";

interface DayStatus {
  date: string;
  status: "ok" | "slow" | "down" | "nodata";
  latencyMs: number | null;
}

const COLORS: Record<DayStatus["status"], string> = {
  ok: "bg-emerald-500",
  slow: "bg-amber-400",
  down: "bg-rose-500",
  nodata: "bg-muted-foreground/20",
};

const LABELS: Record<DayStatus["status"], string> = {
  ok: "正常",
  slow: "偏慢",
  down: "异常",
  nodata: "无数据",
};

export default function UptimeBar({ days }: { days: DayStatus[] }) {
  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex gap-[2px] h-3.5 w-full">
        {days.map((d) => (
          <Tooltip key={d.date}>
            <TooltipTrigger asChild>
              <div
                className={`flex-1 rounded-[2px] ${COLORS[d.status]} hover:opacity-70 transition-opacity cursor-default`}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <div>{d.date}</div>
              <div>
                {LABELS[d.status]}
                {d.latencyMs != null && ` · ${fmtLatency(d.latencyMs)}`}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

import { useEffect, useState } from "react";
import { Megaphone, ExternalLink, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AdBeacon from "@/components/AdBeacon";
import { trpc } from "@/providers/trpc";

type ZoneAd = {
  campaignId: number;
  id: number;
  name: string;
  domain: string;
  url: string;
  description: string | null;
  vendors: string[];
};

type Zone = "top" | "bottom" | "left" | "right" | "popup";

function useZoneVisit() {
  const visit = trpc.platform.visit.useMutation({
    onSuccess: (data) => window.open(data.url, "_blank", "noopener"),
  });
  return visit;
}

/** 顶部 / 底部横幅广告 */
export function AdBanner({ position }: { position: "top" | "bottom" }) {
  const { data } = trpc.platform.zoneAds.useQuery({ position });
  const visit = useZoneVisit();
  if (!data || data.length === 0) return null;
  const ad: ZoneAd = data[0];
  return (
    <div className="border-b bg-amber-500/5 dark:bg-amber-500/10">
      <div className="max-w-[1400px] mx-auto px-4 py-2 flex items-center gap-3 text-sm">
        <AdBeacon platformId={ad.id} position={position} />
        <Badge className="bg-amber-500 hover:bg-amber-500 text-white shrink-0">广告</Badge>
        <span className="font-medium truncate">{ad.name}</span>
        <span className="text-muted-foreground truncate hidden sm:inline">
          {ad.description ?? ad.domain}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto shrink-0 h-7"
          disabled={visit.isPending}
          onClick={() => visit.mutate({ platformId: ad.id, source: `ad-${position}` })}
        >
          <ExternalLink className="w-3.5 h-3.5 mr-1" /> 访问
        </Button>
      </div>
    </div>
  );
}

/** 左右侧栏广告（仅宽屏显示） */
export function SideAdRails() {
  const { data: leftAds } = trpc.platform.zoneAds.useQuery({ position: "left" });
  const { data: rightAds } = trpc.platform.zoneAds.useQuery({ position: "right" });
  const visit = useZoneVisit();
  const render = (ads: ZoneAd[] | undefined, pos: "left" | "right") => {
    if (!ads || ads.length === 0) return null;
    return (
      <div
        className={`fixed top-32 z-10 hidden 2xl:flex flex-col gap-3 w-44 ${
          pos === "left" ? "left-2" : "right-2"
        }`}
      >
        {ads.map((ad) => (
          <div key={ad.campaignId} className="rounded-xl border bg-card p-3 shadow-sm space-y-2">
            <AdBeacon platformId={ad.id} position={pos} />
            <div className="flex items-center justify-between">
              <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-[10px] px-1.5 py-0">广告</Badge>
            </div>
            <div className="font-medium text-sm truncate">{ad.name}</div>
            <div className="text-xs text-muted-foreground line-clamp-2">
              {ad.description ?? ad.domain}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs"
              disabled={visit.isPending}
              onClick={() => visit.mutate({ platformId: ad.id, source: `ad-${pos}` })}
            >
              <ExternalLink className="w-3 h-3 mr-1" /> 访问
            </Button>
          </div>
        ))}
      </div>
    );
  };
  return (
    <>
      {render(leftAds, "left")}
      {render(rightAds, "right")}
    </>
  );
}

/** 弹窗广告：每个会话只弹一次，延迟 2.5 秒 */
export function AdPopup() {
  const { data } = trpc.platform.zoneAds.useQuery({ position: "popup" });
  const visit = useZoneVisit();
  const [open, setOpen] = useState(false);
  const ad: ZoneAd | undefined = data?.[0];

  useEffect(() => {
    if (!ad) return;
    if (sessionStorage.getItem("adPopupSeen")) return;
    const timer = setTimeout(() => {
      setOpen(true);
      sessionStorage.setItem("adPopupSeen", "1");
    }, 2500);
    return () => clearTimeout(timer);
  }, [ad]);

  if (!ad || !open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-sm rounded-2xl border bg-card p-6 shadow-xl space-y-3">
        {open && <AdBeacon platformId={ad.id} position="popup" />}
        <button
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(false)}
          aria-label="关闭"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <Badge className="bg-amber-500 hover:bg-amber-500 text-white">广告</Badge>
          <Megaphone className="w-4 h-4 text-amber-500" />
        </div>
        <div className="text-lg font-bold">{ad.name}</div>
        <div className="text-sm text-muted-foreground line-clamp-3">
          {ad.description ?? ad.domain}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {ad.vendors.slice(0, 5).map((v) => (
            <span key={v} className="text-[11px] px-1.5 py-0.5 rounded bg-muted">
              {v}
            </span>
          ))}
        </div>
        <Button
          className="w-full bg-orange-600 hover:bg-orange-700"
          disabled={visit.isPending}
          onClick={() => {
            visit.mutate({ platformId: ad.id, source: "ad-popup" });
            setOpen(false);
          }}
        >
          <ExternalLink className="w-4 h-4 mr-1" /> 前往体验
        </Button>
      </div>
    </div>
  );
}

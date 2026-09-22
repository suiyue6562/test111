import { useEffect, useRef } from "react";
import { trpc } from "@/providers/trpc";

/**
 * 广告曝光埋点：广告卡片真实渲染到页面上时上报一次曝光。
 * 同一页面会话内同一站点同一位置只报一次，避免重复渲染刷量。
 */
const reported = new Set<string>();

export default function AdBeacon({
  platformId,
  position,
}: {
  platformId: number;
  position: "home" | "list";
}) {
  const mut = trpc.platform.adImpression.useMutation();
  const mutRef = useRef(mut);
  mutRef.current = mut;

  useEffect(() => {
    const key = `${platformId}:${position}`;
    if (reported.has(key)) return;
    reported.add(key);
    mutRef.current.mutate({ platformId, position });
  }, [platformId, position]);

  return null;
}

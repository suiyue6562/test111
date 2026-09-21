import type { CookieOptions } from "hono/utils/cookie";

function isLocalhost(headers: Headers): boolean {
  const host = headers.get("host") || "";
  return host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}

export function getSessionCookieOptions(headers: Headers): CookieOptions {
  const localhost = isLocalhost(headers);
  // 仅在请求确为 HTTPS 时设置 Secure（经 nginx 反代时看 X-Forwarded-Proto），
  // 否则 HTTP 站点下浏览器会拒存 Cookie 导致登录失效
  const https = (headers.get("x-forwarded-proto") ?? "") === "https";

  return {
    httpOnly: true,
    path: "/",
    // SameSite=None 必须搭配 Secure；HTTP 环境退回 Lax（本站 API 同源，无影响）
    sameSite: https && !localhost ? "None" : "Lax",
    secure: https,
  };
}

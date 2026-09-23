import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { Paths } from "@contracts/constants";
import { registerSeo } from "./seo";

const app = new Hono<{ Bindings: HttpBindings }>();

registerSeo(app);

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.get(Paths.oauthCallback, createOAuthCallbackHandler());
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

// 旧后台路径 /admin 已下线：一律返回真实 404（不走 SPA 兜底），
// 不暴露任何后台存在痕迹，防扫描器摸路径
app.all("/admin", (c) => c.text("Not Found", 404));
app.all("/admin/*", (c) => c.text("Not Found", 404));
// 隐藏管理后台入口：防索引（路径本身不出现于任何导航/sitemap/robots）
app.use("/suiyue1987", async (c, next) => {
  await next();
  c.header("X-Robots-Tag", "noindex, nofollow, noarchive");
});
app.use("/suiyue1987/*", async (c, next) => {
  await next();
  c.header("X-Robots-Tag", "noindex, nofollow, noarchive");
});

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

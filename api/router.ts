import { authRouter } from "./auth-router";
import { accountRouter } from "./account-router";
import { platformRouter } from "./platform-router";
import { pricingRouter } from "./pricing-router";
import { forumRouter, reviewRouter } from "./forum-router";
import { sksRouter, sktRouter, skrRouter } from "./tools-router";
import { adminRouter } from "./admin-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  account: accountRouter,
  platform: platformRouter,
  pricing: pricingRouter,
  forum: forumRouter,
  review: reviewRouter,
  sks: sksRouter,
  skt: sktRouter,
  skr: skrRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;

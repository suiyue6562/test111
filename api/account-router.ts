import * as cookie from "cookie";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { Session } from "@contracts/constants";
import { users } from "@db/schema";
import { getDb } from "./queries/connection";
import { getSessionCookieOptions } from "./lib/cookies";
import { signSessionToken } from "./kimi/session";
import { env } from "./lib/env";
import { createRouter, publicQuery } from "./middleware";

function hashPassword(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(pw, salt, 64).toString("hex");
}

function verifyPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const calc = scryptSync(pw, salt, 64);
  const ref = Buffer.from(hash, "hex");
  return calc.length === ref.length && timingSafeEqual(calc, ref);
}

function setSessionCookie(
  resHeaders: Headers,
  reqHeaders: Headers,
  token: string,
) {
  const opts = getSessionCookieOptions(reqHeaders);
  resHeaders.append(
    "set-cookie",
    cookie.serialize(Session.cookieName, token, {
      httpOnly: opts.httpOnly,
      path: opts.path,
      sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
      secure: opts.secure,
      maxAge: Session.maxAgeMs / 1000,
    }),
  );
}

const credInput = z.object({
  username: z
    .string()
    .min(3, "用户名至少 3 个字符")
    .max(32, "用户名最多 32 个字符")
    .regex(/^[a-zA-Z0-9_\-一-龥]+$/, "用户名只能包含中英文、数字、下划线"),
  password: z.string().min(6, "密码至少 6 位").max(64),
});

export const accountRouter = createRouter({
  register: publicQuery.input(credInput).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const unionId = `local_${input.username}`;
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.unionId, unionId))
      .limit(1);
    if (existing.length > 0) {
      throw new TRPCError({ code: "CONFLICT", message: "用户名已被注册" });
    }
    // 首个注册用户成为管理员
    const count = await db.select({ id: users.id }).from(users).limit(2);
    const role = count.length === 0 ? "admin" : "user";
    await db.insert(users).values({
      unionId,
      name: input.username,
      passwordHash: hashPassword(input.password),
      role,
      lastSignInAt: new Date(),
    });
    const token = await signSessionToken({ unionId, clientId: env.appId });
    setSessionCookie(ctx.resHeaders, ctx.req.headers, token);
    return { success: true, name: input.username, role };
  }),

  login: publicQuery.input(credInput).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const unionId = `local_${input.username}`;
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.unionId, unionId))
      .limit(1);
    if (
      !user ||
      !user.passwordHash ||
      !verifyPassword(input.password, user.passwordHash)
    ) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "用户名或密码错误",
      });
    }
    if (user.status === "banned") {
      throw new TRPCError({ code: "FORBIDDEN", message: "账号已被封禁" });
    }
    await db
      .update(users)
      .set({ lastSignInAt: new Date() })
      .where(eq(users.id, user.id));
    const token = await signSessionToken({ unionId, clientId: env.appId });
    setSessionCookie(ctx.resHeaders, ctx.req.headers, token);
    return { success: true, name: user.name, role: user.role };
  }),
});

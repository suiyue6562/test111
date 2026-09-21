import { z } from "zod";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  forumCategories,
  forumPosts,
  forumComments,
  users,
  reviews,
  platforms,
} from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, publicQuery, authedQuery } from "./middleware";

export const forumRouter = createRouter({
  categories: publicQuery.query(async () => {
    const db = getDb();
    const cats = await db.select().from(forumCategories).orderBy(forumCategories.sort);
    const counts = await db
      .select({ categoryId: forumPosts.categoryId, n: sql<number>`count(*)` })
      .from(forumPosts)
      .where(eq(forumPosts.status, "published"))
      .groupBy(forumPosts.categoryId);
    return cats.map((c) => ({
      ...c,
      postCount: counts.find((x) => x.categoryId === c.id)?.n ?? 0,
    }));
  }),

  posts: publicQuery
    .input(
      z.object({
        category: z.string().optional(),
        search: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const conds = [eq(forumPosts.status, "published")];
      if (input.category) {
        const [cat] = await db
          .select()
          .from(forumCategories)
          .where(eq(forumCategories.slug, input.category))
          .limit(1);
        if (cat) conds.push(eq(forumPosts.categoryId, cat.id));
      }
      if (input.search) conds.push(like(forumPosts.title, `%${input.search}%`));
      const rows = await db
        .select({
          post: forumPosts,
          authorName: users.name,
          categorySlug: forumCategories.slug,
          categoryName: forumCategories.name,
        })
        .from(forumPosts)
        .leftJoin(users, eq(forumPosts.userId, users.id))
        .leftJoin(forumCategories, eq(forumPosts.categoryId, forumCategories.id))
        .where(and(...conds))
        .orderBy(desc(forumPosts.pinned), desc(forumPosts.createdAt));
      const total = rows.length;
      const start = (input.page - 1) * input.pageSize;
      return {
        total,
        items: rows.slice(start, start + input.pageSize).map((r) => ({
          ...r.post,
          authorName: r.authorName,
          categorySlug: r.categorySlug,
          categoryName: r.categoryName,
        })),
      };
    }),

  post: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [row] = await db
        .select({
          post: forumPosts,
          authorName: users.name,
          categorySlug: forumCategories.slug,
          categoryName: forumCategories.name,
        })
        .from(forumPosts)
        .leftJoin(users, eq(forumPosts.userId, users.id))
        .leftJoin(forumCategories, eq(forumPosts.categoryId, forumCategories.id))
        .where(eq(forumPosts.id, input.id))
        .limit(1);
      if (!row || row.post.status === "hidden") {
        throw new TRPCError({ code: "NOT_FOUND", message: "帖子不存在" });
      }
      await db
        .update(forumPosts)
        .set({ views: row.post.views + 1 })
        .where(eq(forumPosts.id, input.id));
      const comments = await db
        .select({ comment: forumComments, authorName: users.name })
        .from(forumComments)
        .leftJoin(users, eq(forumComments.userId, users.id))
        .where(and(eq(forumComments.postId, input.id), eq(forumComments.status, "published")))
        .orderBy(forumComments.createdAt);
      return {
        ...row.post,
        views: row.post.views + 1,
        authorName: row.authorName,
        categorySlug: row.categorySlug,
        categoryName: row.categoryName,
        comments: comments.map((c) => ({ ...c.comment, authorName: c.authorName })),
      };
    }),

  createPost: authedQuery
    .input(
      z.object({
        categorySlug: z.string(),
        title: z.string().min(2, "标题至少 2 个字符").max(120),
        content: z.string().min(5, "内容至少 5 个字符").max(20000),
        tags: z.array(z.string().max(20)).max(5).default([]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [cat] = await db
        .select()
        .from(forumCategories)
        .where(eq(forumCategories.slug, input.categorySlug))
        .limit(1);
      if (!cat) throw new TRPCError({ code: "NOT_FOUND", message: "板块不存在" });
      const [{ id }] = await db
        .insert(forumPosts)
        .values({
          categoryId: cat.id,
          userId: ctx.user.id,
          title: input.title,
          content: input.content,
          tags: input.tags,
        })
        .$returningId();
      return { id };
    }),

  createComment: authedQuery
    .input(
      z.object({
        postId: z.number(),
        content: z.string().min(1, "评论不能为空").max(5000),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [post] = await db
        .select()
        .from(forumPosts)
        .where(eq(forumPosts.id, input.postId))
        .limit(1);
      if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "帖子不存在" });
      const [{ id }] = await db
        .insert(forumComments)
        .values({ postId: input.postId, userId: ctx.user.id, content: input.content })
        .$returningId();
      await db
        .update(forumPosts)
        .set({ commentCount: post.commentCount + 1 })
        .where(eq(forumPosts.id, input.postId));
      return { id };
    }),

  myPosts: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select()
      .from(forumPosts)
      .where(eq(forumPosts.userId, ctx.user.id))
      .orderBy(desc(forumPosts.createdAt));
  }),
});

// ---------- 点评 ----------
export const reviewRouter = createRouter({
  create: authedQuery
    .input(
      z.object({
        platformId: z.number(),
        rating: z.number().int().min(1).max(5),
        content: z.string().min(5, "点评至少 5 个字符").max(2000),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [p] = await db
        .select()
        .from(platforms)
        .where(eq(platforms.id, input.platformId))
        .limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "站点不存在" });
      await db.insert(reviews).values({
        platformId: input.platformId,
        userId: ctx.user.id,
        rating: input.rating,
        content: input.content,
      });
      return { success: true };
    }),
});

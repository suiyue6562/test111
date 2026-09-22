import { useNavigate } from "react-router";
import { Heart, UploadCloud, Package, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PlatformCard from "@/components/PlatformCard";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { fmtDateTime } from "@/lib/format";

export default function UserCenter() {
  const { user, isAuthenticated, isLoading } = useAuth({ redirectOnUnauthenticated: true });
  const navigate = useNavigate();
  const { data: favs } = trpc.platform.myFavorites.useQuery(undefined, { enabled: isAuthenticated });
  const { data: subs } = trpc.sks.my.useQuery(undefined, { enabled: isAuthenticated });
  const { data: codes } = trpc.skr.myCodes.useQuery(undefined, { enabled: isAuthenticated });
  const { data: posts } = trpc.forum.myPosts.useQuery(undefined, { enabled: isAuthenticated });

  if (isLoading || !user) return null;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-6 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white text-xl font-bold">
          {(user.name ?? "U")[0].toUpperCase()}
        </div>
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            {user.name}
            {user.role === "admin" && <Badge className="bg-orange-600">管理员</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            注册于 {fmtDateTime(user.createdAt)} · 最近登录 {fmtDateTime(user.lastSignInAt)}
          </p>
        </div>
      </div>

      <Tabs defaultValue="favorites">
        <TabsList>
          <TabsTrigger value="favorites" className="gap-1.5">
            <Heart className="w-3.5 h-3.5" /> 收藏（{favs?.length ?? 0}）
          </TabsTrigger>
          <TabsTrigger value="subs" className="gap-1.5">
            <UploadCloud className="w-3.5 h-3.5" /> 收录申请（{subs?.length ?? 0}）
          </TabsTrigger>
          <TabsTrigger value="codes" className="gap-1.5">
            <Package className="w-3.5 h-3.5" /> 码包（{codes?.length ?? 0}）
          </TabsTrigger>
          <TabsTrigger value="posts" className="gap-1.5">
            <FileText className="w-3.5 h-3.5" /> 帖子（{posts?.length ?? 0}）
          </TabsTrigger>
        </TabsList>

        <TabsContent value="favorites" className="pt-4">
          {!favs?.length ? (
            <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
              还没有收藏任何平台
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {favs.map((p) => (
                <PlatformCard key={p.id} platform={p} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="subs" className="pt-4">
          <div className="rounded-xl border bg-card p-4 space-y-2">
            {!subs?.length ? (
              <div className="text-sm text-muted-foreground py-6 text-center">暂无申请记录</div>
            ) : (
              subs.map((s) => (
                <div key={s.id} className="rounded-lg border p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.url}</div>
                    <div className="text-xs text-muted-foreground">{fmtDateTime(s.createdAt)}</div>
                  </div>
                  <Badge variant={s.status === "approved" ? "default" : s.status === "rejected" ? "destructive" : "secondary"}>
                    {s.status === "approved" ? "已收录" : s.status === "rejected" ? "未通过" : "审核中"}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="codes" className="pt-4">
          <div className="rounded-xl border bg-card p-4 space-y-2">
            {!codes?.length ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                暂无兑换码
                <Button variant="link" onClick={() => navigate("/skr")}>去领取</Button>
              </div>
            ) : (
              codes.map((c) => (
                <div key={c.id} className="rounded-lg border p-3">
                  <div className="font-mono text-sm font-semibold tracking-wider">{c.code}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.actTitle} · {fmtDateTime(c.claimedAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="posts" className="pt-4">
          <div className="rounded-xl border bg-card p-4 space-y-2">
            {!posts?.length ? (
              <div className="text-sm text-muted-foreground py-6 text-center">还没发过帖</div>
            ) : (
              posts.map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border p-3 cursor-pointer hover:bg-muted/40"
                  onClick={() => navigate(`/forum/t/${p.id}`)}
                >
                  <div className="text-sm font-medium">{p.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDateTime(p.createdAt)} · {p.views} 阅读 · {p.commentCount} 评论
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Eye, MessageSquare, Pin, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/format";

export default function ForumPost() {
  const { id } = useParams();
  const postId = Number(id);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const { data: post, isLoading } = trpc.forum.post.useQuery(
    { id: postId },
    { enabled: postId > 0 },
  );
  const [comment, setComment] = useState("");

  const addComment = trpc.forum.createComment.useMutation({
    onSuccess: () => {
      setComment("");
      toast.success("评论成功");
      utils.forum.post.invalidate({ id: postId });
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-96 rounded-xl" />;
  if (!post) return <div className="text-center py-20 text-muted-foreground">帖子不存在</div>;

  return (
    <div className="space-y-5 max-w-4xl">
      <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4 mr-1" /> 返回
      </Button>

      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center gap-2 flex-wrap">
          {post.pinned && (
            <Badge className="bg-orange-600 gap-0.5">
              <Pin className="w-3 h-3" /> 置顶
            </Badge>
          )}
          <Badge variant="secondary">{post.categoryName}</Badge>
          {(post.tags as string[]).map((tg) => (
            <Badge key={tg} variant="outline" className="text-[11px]">{tg}</Badge>
          ))}
        </div>
        <h1 className="text-xl font-bold mt-3">{post.title}</h1>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span>{post.authorName ?? "匿名"}</span>
          <span>{fmtDateTime(post.createdAt)}</span>
          <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {post.views}</span>
          <span className="flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> {post.commentCount}</span>
        </div>
        <div className="mt-5 text-[15px] leading-7 whitespace-pre-wrap">{post.content}</div>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h2 className="font-semibold">全部评论（{post.comments.length}）</h2>
        {isAuthenticated ? (
          <div className="flex gap-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="友善评论，理性交流…"
              rows={2}
              className="flex-1"
            />
            <Button
              className="bg-orange-600 hover:bg-orange-700 self-end"
              disabled={addComment.isPending || !comment.trim()}
              onClick={() => addComment.mutate({ postId, content: comment.trim() })}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            <Button variant="link" onClick={() => navigate("/login")}>登录</Button>
            后参与讨论
          </div>
        )}
        <div className="space-y-3">
          {post.comments.length === 0 && (
            <div className="text-sm text-muted-foreground py-4 text-center">暂无评论</div>
          )}
          {post.comments.map((c, i) => (
            <div key={c.id} className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground text-sm">{c.authorName ?? "匿名"}</span>
                <span>{i + 1} 楼</span>
                <span className="ml-auto">{fmtDateTime(c.createdAt)}</span>
              </div>
              <p className="text-sm mt-1.5 whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Eye, MessageSquare, Pin, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { timeAgo } from "@/lib/format";

export default function Forum() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const { data: cats } = trpc.forum.categories.useQuery();
  const { data, isLoading } = trpc.forum.posts.useQuery({
    category: slug,
    search: params.get("q") ?? undefined,
    page,
    pageSize: 20,
  });

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [catSlug, setCatSlug] = useState(slug ?? "general");
  const [tagsInput, setTagsInput] = useState("");

  const createPost = trpc.forum.createPost.useMutation({
    onSuccess: (r) => {
      toast.success("发布成功");
      setOpen(false);
      setTitle("");
      setContent("");
      setTagsInput("");
      utils.forum.posts.invalidate();
      navigate(`/forum/t/${r.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 20)) : 1;
  const currentCat = cats?.find((c) => c.slug === slug);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold">{currentCat ? currentCat.name : "交流论坛"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {currentCat?.description ?? "交流 AI API 使用经验、获取福利信息、参与站点评测"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setParams(search ? { q: search } : {});
            }}
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索帖子…"
              className="h-9 w-52 rounded-full border bg-background pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </form>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={(e) => {
                  if (!isAuthenticated) {
                    e.preventDefault();
                    toast.error("请先登录后再发帖");
                    navigate("/login");
                  }
                }}
              >
                <Plus className="w-4 h-4 mr-1" /> 发帖
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>发布新帖</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Select value={catSlug} onValueChange={setCatSlug}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择板块" />
                  </SelectTrigger>
                  <SelectContent>
                    {cats?.map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="标题（2-120 字）"
                />
                <Input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="标签，用逗号分隔（最多 5 个，可选）"
                />
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="正文内容…"
                  rows={8}
                />
                <Button
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                  disabled={createPost.isPending || title.trim().length < 2 || content.trim().length < 5}
                  onClick={() =>
                    createPost.mutate({
                      categorySlug: catSlug,
                      title: title.trim(),
                      content: content.trim(),
                      tags: tagsInput.split(/[,，]/).map((t) => t.trim()).filter(Boolean).slice(0, 5),
                    })
                  }
                >
                  发布
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : data?.items.length === 0 ? (
        <div className="rounded-xl border bg-card p-16 text-center text-sm text-muted-foreground">
          暂无帖子，来发第一帖吧
        </div>
      ) : (
        <div className="space-y-3">
          {data?.items.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border bg-card p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/forum/t/${p.id}`)}
            >
              <div className="flex items-center gap-2 flex-wrap">
                {p.pinned && (
                  <Badge className="bg-indigo-600 gap-0.5">
                    <Pin className="w-3 h-3" /> 置顶
                  </Badge>
                )}
                <Badge variant="secondary">{p.categoryName}</Badge>
                {(p.tags as string[]).map((tg) => (
                  <Badge key={tg} variant="outline" className="text-[11px]">{tg}</Badge>
                ))}
              </div>
              <h3 className="font-semibold mt-2 hover:text-indigo-600 dark:hover:text-indigo-400">
                {p.title}
              </h3>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span>{p.authorName ?? "匿名"}</span>
                <span>{timeAgo(p.createdAt)}</span>
                <span className="flex items-center gap-1 ml-auto">
                  <Eye className="w-3.5 h-3.5" /> {p.views}
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5" /> {p.commentCount}
                </span>
              </div>
            </div>
          ))}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                上一页
              </Button>
              <span className="text-sm text-muted-foreground self-center">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                下一页
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

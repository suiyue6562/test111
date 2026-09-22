import { Outlet, useNavigate } from "react-router";
import { Shield, ExternalLink, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/NotFound";

/**
 * 独立管理后台布局：与用户前台完全分离
 * - 不包含用户端的侧边栏导航、搜索、语言切换等前台元素
 * - 非管理员访问一律渲染 404，不暴露后台的存在
 * - 入口不出现在用户端任何导航中，仅通过直接访问 /admin 进入
 */
export default function AdminLayout() {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 text-sm">加载中…</div>
      </div>
    );
  }
  if (user?.role !== "admin") {
    // 对非管理员隐藏后台存在，返回与不存在页面一致的 404
    return <NotFound />;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="h-14 border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-20 flex items-center gap-3 px-5">
        <div className="flex items-center gap-2 font-semibold">
          <Shield className="w-5 h-5 text-indigo-400" />
          API优选 · 管理控制台
        </div>
        <span className="text-xs text-slate-500">与前台相互独立 · 仅管理员可见</span>
        <div className="flex-1" />
        <span className="text-xs text-slate-400">{user.name}</span>
        <Button
          variant="outline"
          size="sm"
          className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-slate-100"
          onClick={() => navigate("/")}
        >
          <ExternalLink className="w-3.5 h-3.5 mr-1" /> 返回前台
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-slate-100"
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          <LogOut className="w-3.5 h-3.5 mr-1" /> 退出
        </Button>
      </header>
      <main className="max-w-7xl mx-auto p-5">
        <Outlet />
      </main>
    </div>
  );
}

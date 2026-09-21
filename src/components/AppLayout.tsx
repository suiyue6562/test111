import React, { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import {
  LayoutGrid,
  Compass,
  Tags,
  UploadCloud,
  KeyRound,
  Gift,
  MessagesSquare,
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Moon,
  Sun,
  User as UserIcon,
  Shield,
  LogOut,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/providers/trpc";

const FORUM_CATS = [
  { slug: "general", name: "综合交流" },
  { slug: "welfare", name: "福利羊毛" },
  { slug: "redeem", name: "发码活动" },
  { slug: "reviews", name: "站点点评" },
  { slug: "feedback", name: "站务反馈" },
];

export default function AppLayout({ children }: { children?: React.ReactNode }) {
  const { t, lang, setLang, theme, toggleTheme, sidebarCollapsed, setSidebarCollapsed } = useApp();
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [kw, setKw] = useState("");
  const [forumOpen, setForumOpen] = useState(true);
  const { data: categories } = trpc.forum.categories.useQuery();
  const cats = categories?.length ? categories : FORUM_CATS.map((c, i) => ({ ...c, id: i, description: "", sort: i, postCount: 0 }));

  const navItems = [
    { to: "/", icon: LayoutGrid, label: t("home"), end: true },
    { to: "/discover", icon: Compass, label: t("discover") },
    { to: "/pricing", icon: Tags, label: t("pricing") },
    { to: "/sks", icon: UploadCloud, label: t("sks") },
    { to: "/skt", icon: KeyRound, label: t("skt") },
    { to: "/skr", icon: Gift, label: t("skr") },
  ];

  const doSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/discover?q=${encodeURIComponent(kw)}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* 侧边栏 */}
      <aside
        className={`shrink-0 border-r bg-card/60 backdrop-blur flex flex-col transition-all duration-200 sticky top-0 h-screen ${
          sidebarCollapsed ? "w-16" : "w-56"
        }`}
      >
        <Link to="/" className="flex items-center gap-2 px-4 h-16 border-b">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          {!sidebarCollapsed && (
            <div className="leading-tight">
              <div className="font-bold text-sm">API 优选</div>
              <div className="text-[10px] text-muted-foreground">apixuan workspace</div>
            </div>
          )}
        </Link>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {!sidebarCollapsed && (
            <div className="px-2 pb-1 text-[10px] font-medium tracking-widest text-muted-foreground">
              NAVIGATION
            </div>
          )}
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`
              }
              title={item.label}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </NavLink>
          ))}

          {/* 论坛 */}
          <button
            onClick={() => setForumOpen(!forumOpen)}
            className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            title={t("forum")}
          >
            <MessagesSquare className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && (
              <>
                <span className="flex-1 text-left">{t("forum")}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${forumOpen ? "" : "-rotate-90"}`} />
              </>
            )}
          </button>
          {forumOpen && !sidebarCollapsed && (
            <div className="ml-5 space-y-0.5 border-l pl-3">
              <NavLink
                to="/forum"
                end
                className={({ isActive }) =>
                  `block rounded-md px-2 py-1.5 text-[13px] ${isActive ? "text-indigo-600 dark:text-indigo-400 font-medium" : "text-muted-foreground hover:text-foreground"}`
                }
              >
                全部帖子
              </NavLink>
              {cats.map((c) => (
                <NavLink
                  key={c.slug}
                  to={`/forum/c/${c.slug}`}
                  className={({ isActive }) =>
                    `block rounded-md px-2 py-1.5 text-[13px] ${isActive ? "text-indigo-600 dark:text-indigo-400 font-medium" : "text-muted-foreground hover:text-foreground"}`
                  }
                >
                  {c.name}
                </NavLink>
              ))}
            </div>
          )}

          <NavLink
            to="/guide"
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${
                isActive
                  ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`
            }
            title={t("guide")}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span>{t("guide")}</span>}
          </NavLink>
        </nav>

        <div className="p-2 border-t">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <>
                <PanelLeftClose className="w-4 h-4" />
                <span>{t("collapse")}</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* 主区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-card/60 backdrop-blur sticky top-0 z-20 flex items-center gap-3 px-4">
          <div className="hidden md:block">
            <div className="text-[10px] tracking-widest text-muted-foreground font-medium">APIXUAN WORKSPACE</div>
            <div className="text-sm font-semibold">{t("workspace")}</div>
          </div>
          <div className="flex-1" />
          <form onSubmit={doSearch} className="relative hidden sm:block w-64 lg:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder={t("search")}
              className="w-full h-9 rounded-full border bg-background pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </form>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            title="Language"
          >
            <span className="text-xs font-semibold">{lang === "zh" ? "EN" : "中"}</span>
          </Button>
          <Button variant="outline" size="icon" className="rounded-full" onClick={toggleTheme}>
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="rounded-full gap-2">
                  <UserIcon className="w-4 h-4" />
                  <span className="max-w-24 truncate">{user?.name ?? "用户"}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate("/me")}>
                  <UserIcon className="w-4 h-4 mr-2" /> {t("userCenter")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="w-4 h-4 mr-2" /> {t("logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-full" onClick={() => navigate("/login")}>
                {t("login")}
              </Button>
              <Button className="rounded-full bg-indigo-600 hover:bg-indigo-700" onClick={() => navigate("/register")}>
                {t("register")}
              </Button>
            </div>
          )}
        </header>

        <main className="flex-1 p-4 md:p-6 max-w-[1400px] w-full mx-auto">
          {children ?? <Outlet />}
        </main>

        <footer className="border-t py-6 px-6 text-center text-xs text-muted-foreground">
          <div className="flex items-center justify-center gap-4 mb-2 flex-wrap">
            <Link to="/about" className="hover:text-foreground">关于我们</Link>
            <Link to="/guide" className="hover:text-foreground">新手指引</Link>
            <Link to="/sks" className="hover:text-foreground">站点入驻</Link>
            <Link to="/terms" className="hover:text-foreground">用户协议</Link>
            <Link to="/disclaimer" className="hover:text-foreground">风险声明</Link>
          </div>
          © 2026 API 优选 · 数据仅供演示参考
        </footer>
      </div>
    </div>
  );
}

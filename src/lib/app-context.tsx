import React, { createContext, useContext, useEffect, useState } from "react";

type Lang = "zh" | "en";
type Theme = "light" | "dark";

const dict = {
  zh: {
    home: "首页",
    discover: "综合筛选",
    pricing: "价格筛选",
    sks: "收录申请",
    skt: "Key 检测",
    skr: "发码活动",
    forum: "交流论坛",
    guide: "新手指引",
    login: "登录",
    register: "注册",
    logout: "退出登录",
    userCenter: "用户中心",
    admin: "管理后台",
    search: "搜索平台名、域名、描述…",
    visit: "访问",
    review: "点评",
    compare: "对比",
    collapse: "收缩菜单",
    expand: "展开菜单",
    workspace: "AI API 平台聚合与测评",
    normal: "正常",
    slow: "偏慢",
    down: "异常",
    unknown: "未知",
    dayUptime: "30天可用率",
    avgLatency: "平均延迟",
    myCodes: "我的码包",
    myFavorites: "我的收藏",
    mySubmissions: "我的申请",
    myPosts: "我的帖子",
  },
  en: {
    home: "Home",
    discover: "Discover",
    pricing: "Pricing",
    sks: "Submit Site",
    skt: "Key Tester",
    skr: "Redeem Events",
    forum: "Forum",
    guide: "Guide",
    login: "Sign in",
    register: "Sign up",
    logout: "Sign out",
    userCenter: "My Account",
    admin: "Admin",
    search: "Search name, domain, description…",
    visit: "Visit",
    review: "Review",
    compare: "Compare",
    collapse: "Collapse",
    expand: "Expand",
    workspace: "AI API Platform Aggregation & Reviews",
    normal: "OK",
    slow: "Slow",
    down: "Down",
    unknown: "Unknown",
    dayUptime: "30d uptime",
    avgLatency: "Avg latency",
    myCodes: "My Codes",
    myFavorites: "Favorites",
    mySubmissions: "Submissions",
    myPosts: "My Posts",
  },
} as const;

export type DictKey = keyof (typeof dict)["zh"];

interface AppCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: DictKey) => string;
  theme: Theme;
  toggleTheme: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(
    () => (localStorage.getItem("lang") as Lang) || "zh",
  );
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("theme") as Theme) || "light",
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("sidebarCollapsed") === "1",
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("lang", lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  const t = (k: DictKey) => dict[lang][k];

  return (
    <Ctx.Provider
      value={{
        lang,
        setLang,
        t,
        theme,
        toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
        sidebarCollapsed,
        setSidebarCollapsed,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

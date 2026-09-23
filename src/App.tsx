import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router";
import { AppProvider } from "@/lib/app-context";
import AppLayout from "@/components/AppLayout";
import AdminLayout from "@/components/AdminLayout";
import { Skeleton } from "@/components/ui/skeleton";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";

// 路由级懒加载：首屏只加载首页，其余页面按需加载，显著缩小首屏 JS 体积
const Discover = lazy(() => import("./pages/Discover"));
const Compare = lazy(() => import("./pages/Compare"));
const Pricing = lazy(() => import("./pages/Pricing"));
const PlatformDetail = lazy(() => import("./pages/PlatformDetail"));
const Sks = lazy(() => import("./pages/Sks"));
const Skt = lazy(() => import("./pages/Skt"));
const Skr = lazy(() => import("./pages/Skr"));
const SkrMy = lazy(() => import("./pages/SkrMy"));
const Forum = lazy(() => import("./pages/Forum"));
const ForumPost = lazy(() => import("./pages/ForumPost"));
const Login = lazy(() => import("./pages/Login"));
const UserCenter = lazy(() => import("./pages/UserCenter"));
const Admin = lazy(() => import("./pages/Admin"));
const Guide = lazy(() => import("./pages/Guide"));
const Advertise = lazy(() => import("./pages/Advertise"));
const StaticPage = lazy(() => import("./pages/StaticPage"));

const PageFallback = <Skeleton className="h-96 rounded-xl" />;

export default function App() {
  return (
    <AppProvider>
      <Suspense fallback={PageFallback}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/site/:domain" element={<PlatformDetail />} />
            <Route path="/sks" element={<Sks />} />
            <Route path="/skt" element={<Skt />} />
            <Route path="/skr" element={<Skr />} />
            <Route path="/skr/my" element={<SkrMy />} />
            <Route path="/forum" element={<Forum />} />
            <Route path="/forum/c/:slug" element={<Forum />} />
            <Route path="/forum/t/:id" element={<ForumPost />} />
            <Route path="/me" element={<UserCenter />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/advertise" element={<Advertise />} />
            <Route path="/about" element={<StaticPage page="about" />} />
            <Route path="/terms" element={<StaticPage page="terms" />} />
            <Route path="/disclaimer" element={<StaticPage page="disclaimer" />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Login defaultTab="register" />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          {/* 独立管理后台：不使用前台布局，与 UserCenter 完全分离 */}
          <Route path="/suiyue1987" element={<AdminLayout />}>
            <Route index element={<Admin />} />
          </Route>
        </Routes>
      </Suspense>
    </AppProvider>
  );
}

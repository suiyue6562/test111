import { Routes, Route } from "react-router";
import { AppProvider } from "@/lib/app-context";
import AppLayout from "@/components/AppLayout";
import AdminLayout from "@/components/AdminLayout";
import Home from "./pages/Home";
import Discover from "./pages/Discover";
import Compare from "./pages/Compare";
import Pricing from "./pages/Pricing";
import PlatformDetail from "./pages/PlatformDetail";
import Sks from "./pages/Sks";
import Skt from "./pages/Skt";
import Skr from "./pages/Skr";
import SkrMy from "./pages/SkrMy";
import Forum from "./pages/Forum";
import ForumPost from "./pages/ForumPost";
import Login from "./pages/Login";
import UserCenter from "./pages/UserCenter";
import Admin from "./pages/Admin";
import Guide from "./pages/Guide";
import Advertise from "./pages/Advertise";
import StaticPage from "./pages/StaticPage";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <AppProvider>
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
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Admin />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}

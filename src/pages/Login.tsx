import { useState } from "react";
import { useNavigate } from "react-router";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";

function getOAuthUrl() {
  const kimiAuthUrl = import.meta.env.VITE_KIMI_AUTH_URL;
  const appID = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${kimiAuthUrl}/api/oauth/authorize`);
  url.searchParams.set("client_id", appID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "profile");
  url.searchParams.set("state", state);

  return url.toString();
}

export default function Login({ defaultTab = "login" }: { defaultTab?: "login" | "register" }) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const onSuccess = async (name?: string | null) => {
    toast.success(`欢迎，${name ?? "用户"}`);
    await utils.invalidate();
    navigate("/");
  };

  const login = trpc.account.login.useMutation({
    onSuccess: (r) => onSuccess(r.name),
    onError: (e) => toast.error(e.message),
  });
  const register = trpc.account.register.useMutation({
    onSuccess: (r) => onSuccess(r.name),
    onError: (e) => toast.error(e.message),
  });

  const pending = login.isPending || register.isPending;

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center mb-2">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <CardTitle>API 优选</CardTitle>
          <CardDescription>登录后可收藏、点评、领码与发帖</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue={defaultTab}>
            <TabsList className="w-full">
              <TabsTrigger value="login" className="flex-1">登录</TabsTrigger>
              <TabsTrigger value="register" className="flex-1">注册</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="space-y-3 pt-3">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="用户名"
                autoComplete="username"
              />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码"
                autoComplete="current-password"
                onKeyDown={(e) => e.key === "Enter" && login.mutate({ username, password })}
              />
              <Button
                className="w-full bg-indigo-600 hover:bg-indigo-700"
                disabled={pending || !username || !password}
                onClick={() => login.mutate({ username, password })}
              >
                登录
              </Button>
            </TabsContent>
            <TabsContent value="register" className="space-y-3 pt-3">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="用户名（3-32 位）"
                autoComplete="username"
              />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码（至少 6 位）"
                autoComplete="new-password"
              />
              <Button
                className="w-full bg-indigo-600 hover:bg-indigo-700"
                disabled={pending || username.length < 3 || password.length < 6}
                onClick={() => register.mutate({ username, password })}
              >
                注册并登录
              </Button>
            </TabsContent>
          </Tabs>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">或</span>
            <Separator className="flex-1" />
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              window.location.href = getOAuthUrl();
            }}
          >
            使用 Kimi 账号一键登录
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

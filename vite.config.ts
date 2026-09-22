import devServer from "@hono/vite-dev-server"
import path from "path"
const __dirname = import.meta.dirname
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    devServer({ entry: "api/boot.ts", exclude: [/^\/(?!api\/).*$/] }),
    inspectAttr(), react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
      "db": path.resolve(__dirname, "./db"),
    },
  },
  envDir: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // 框架与数据层单独分包：内容稳定、可长期缓存，且浏览器可并行下载
        // 注意不用对象语法列出 recharts——对象语法会被当作入口依赖预加载；
        // recharts 只被懒加载的后台页引用，让它自然进入异步 chunk 即可
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (/\/(react|react-dom|react-router|scheduler)[\/]/.test(id)) return "react";
          if (id.includes("@tanstack") || id.includes("@trpc")) return "query";
          return undefined;
        },
      },
    },
  },
});

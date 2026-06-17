import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// 预览 harness 位于 <project>/.figma-to-code/preview。
// fs.allow 放开到项目根，便于 styles.css 引用项目里的字体/资源（如 ../../<assets>）。
export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  server: {
    port: 5188,
    fs: { allow: [path.resolve(__dirname, "../..")] },
  },
});

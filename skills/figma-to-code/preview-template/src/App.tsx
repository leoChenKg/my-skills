import type { CSSProperties } from "react";
import { registry } from "./registry";

// 单模块隔离路由：URL 带 ?only=<id>（id 用 ":" 或 "-" 皆可）时只渲染该模块，
// 紧贴 w×h、无外层 padding/gap，便于 shoot.mjs 按 data-shoot-root 精确截图。
function getOnly(): string | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("only");
  return v ? v.trim() : null;
}

const normId = (s: string) => s.replace(/-/g, ":");

export default function App() {
  const only = getOnly();

  if (only) {
    const target = normId(only);
    const m = registry.find((x) => normId(x.id) === target);
    if (!m) {
      return (
        <div data-shoot-missing={only} style={{ fontFamily: "monospace", padding: 8, color: "#c00" }}>
          module not found: {only}
        </div>
      );
    }
    const sized = m.w > 0 && m.h > 0;
    const style: CSSProperties = sized
      ? { position: "relative", width: m.w, height: m.h, background: "#fff", overflow: "hidden" }
      : { position: "relative", display: "inline-block", background: "#fff" };
    return (
      <div data-shoot-root={m.id} data-shoot-w={m.w} data-shoot-h={m.h} style={style}>
        <m.Component />
      </div>
    );
  }

  // 画廊模式：列出全部模块（人工浏览用）
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, padding: 32, alignItems: "flex-start" }}>
      {registry.length === 0 && (
        <p style={{ fontFamily: "sans-serif", color: "#666" }}>
          暂无模块。保存 modules/&lt;nodeIdSafe&gt;.tsx 后运行 gen-registry.mjs 生成 registry。
        </p>
      )}
      {registry.map((m) => {
        const sized = m.w > 0 && m.h > 0;
        const style: CSSProperties = sized
          ? { position: "relative", width: m.w, height: m.h, background: "#fff", overflow: "hidden" }
          : { position: "relative", display: "inline-block", background: "#fff" };
        return (
          <div key={m.id}>
            <div style={{ fontFamily: "monospace", fontSize: 12, color: "#888", marginBottom: 6 }}>
              {m.name} · {m.id} · {m.w}×{m.h}
            </div>
            <div data-shoot-root={m.id} data-shoot-w={m.w} data-shoot-h={m.h} style={style}>
              <m.Component />
            </div>
          </div>
        );
      })}
    </div>
  );
}

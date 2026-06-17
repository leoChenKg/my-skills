import type { ComponentType } from 'react'

// 占位文件：由 scripts/gen-registry.mjs 扫描 modules/ 自动生成覆盖，请勿手改。
export interface ModuleEntry {
  id: string
  name: string
  Component: ComponentType<{ className?: string }>
  w: number
  h: number
}

export const registry: ModuleEntry[] = []

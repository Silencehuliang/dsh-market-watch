/**
 * 自选排序(FR-WL-04,纯函数):
 * default = 原顺序(置顶项始终组首,按 order 稳定);asc/desc = 按涨跌幅全排。
 */
export type SortMode = 'default' | 'asc' | 'desc'

export interface SortableWatchItem {
  pinned?: boolean
  order?: number
  changePercent: number
}

export function sortWatchItems<T extends SortableWatchItem>(items: T[], mode: SortMode): T[] {
  const byDefault = (a: T, b: T) =>
    Number(b.pinned ?? false) - Number(a.pinned ?? false) || (a.order ?? 0) - (b.order ?? 0)
  if (mode === 'asc') return [...items].sort((a, b) => a.changePercent - b.changePercent)
  if (mode === 'desc') return [...items].sort((a, b) => b.changePercent - a.changePercent)
  return [...items].sort(byDefault)
}

/** 循环切换三态(default → asc → desc → default)。 */
export function nextSortMode(mode: SortMode): SortMode {
  return mode === 'default' ? 'asc' : mode === 'asc' ? 'desc' : 'default'
}

/** 内置分组(单一真相:显示名与市场映射都从这里出)。 */
export interface BuiltinGroup {
  readonly id: string
  readonly name: string
  /** 归入该组的市场;空数组表示兜底组。 */
  readonly markets: readonly string[]
}

export const BUILTIN_GROUPS: readonly BuiltinGroup[] = [
  { id: 'builtin:a_stock', name: 'A股', markets: ['cn_sh', 'cn_sz', 'cn_bj'] },
  { id: 'builtin:hk', name: '港股', markets: ['hk'] },
  { id: 'builtin:us', name: '美股', markets: ['us'] },
  { id: 'builtin:fund', name: '基金', markets: ['fund'] },
  { id: 'builtin:other', name: '其他', markets: [] },
]

/** 按市场归入内置分组(兜底 builtin:other)。 */
export function groupForMarket(market: string): string {
  return (BUILTIN_GROUPS.find((g) => g.markets.includes(market)) ?? BUILTIN_GROUPS[BUILTIN_GROUPS.length - 1]!).id
}

/** 内置分组的显示名。 */
export function builtinGroupName(groupId: string): string | null {
  return BUILTIN_GROUPS.find((g) => g.id === groupId)?.name ?? null
}

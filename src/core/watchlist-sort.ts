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

/** 内置分组的显示名。 */
export function builtinGroupName(groupId: string): string | null {
  const map: Record<string, string> = {
    'builtin:a_stock': 'A股',
    'builtin:hk': '港股',
    'builtin:us': '美股',
    'builtin:fund': '基金',
    'builtin:other': '其他',
  }
  return map[groupId] ?? null
}

import { describe, expect, it } from 'vitest'
import { builtinGroupName, nextSortMode, sortWatchItems } from '../src/core/watchlist-sort'

function item(p: Partial<{ pinned: boolean; order: number; changePercent: number }>) {
  return { pinned: false, order: 0, changePercent: 0, ...p }
}

describe('sortWatchItems (FR-WL-04)', () => {
  const items = [
    item({ order: 2, changePercent: 1.0 }),
    item({ order: 0, pinned: true, changePercent: -2.0 }),
    item({ order: 1, changePercent: 3.0 }),
  ]

  it('default:置顶始终组首,按 order', () => {
    const sorted = sortWatchItems(items, 'default')
    expect(sorted[0]!.pinned).toBe(true)
    expect(sorted.map((i) => i.order)).toEqual([0, 1, 2])
  })
  it('asc:涨跌幅升序', () => {
    const sorted = sortWatchItems(items, 'asc')
    expect(sorted.map((i) => i.changePercent)).toEqual([-2.0, 1.0, 3.0])
  })
  it('desc:涨跌幅降序', () => {
    const sorted = sortWatchItems(items, 'desc')
    expect(sorted.map((i) => i.changePercent)).toEqual([3.0, 1.0, -2.0])
  })
  it('不改变原数组', () => {
    sortWatchItems(items, 'desc')
    expect(items[0]!.order).toBe(2)
  })
})

describe('nextSortMode', () => {
  it('三态循环 default→asc→desc→default', () => {
    expect(nextSortMode('default')).toBe('asc')
    expect(nextSortMode('asc')).toBe('desc')
    expect(nextSortMode('desc')).toBe('default')
  })
})

describe('builtinGroupName', () => {
  it('内置组映射显示名,自定义返回 null', () => {
    expect(builtinGroupName('builtin:a_stock')).toBe('A股')
    expect(builtinGroupName('builtin:fund')).toBe('基金')
    expect(builtinGroupName('custom:1')).toBeNull()
  })
})

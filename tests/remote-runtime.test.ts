import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { MarketWatchRuntime } from '../src/remote/runtime'
import type { MarketWatchDataAccess } from '../src/remote/runtime'

function makeData(overrides: Partial<MarketWatchDataAccess> = {}): MarketWatchDataAccess {
  return {
    getWatchlistWithQuotes: async () => ({
      items: [
        {
          symbol: 'cn_sh:600519',
          name: '贵州茅台',
          groupId: 'builtin:a_stock',
          pinned: false,
          order: 0,
          price: 1444.99,
          changePercent: -0.55,
          asOf: '2026-11-10 15:00:00',
          stale: false,
        },
      ],
    }),
    getHoldingsView: async () => ({
      items: [{ symbol: 'fund:110022', profitRate: 2.5, isClosed: false }],
    }),
    getSettingsView: () => ({ intervalMs: 5000, riseColor: 'red', privacy: { exposeAmounts: false } }),
    ...overrides,
  }
}

describe('MarketWatchRuntime', () => {
  it('getWatchlist 返回经 schema 校验的自选行情', async () => {
    const svc = new MarketWatchRuntime(new Context(), makeData())
    const result = await svc.getWatchlist()
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.symbol).toBe('cn_sh:600519')
    expect(result.items[0]!.price).toBe(1444.99)
  })

  it('getWatchlist:行情缺失的标的 price=0 且 stale=true', async () => {
    const svc = new MarketWatchRuntime(
      new Context(),
      makeData({
        getWatchlistWithQuotes: async () => ({
          items: [
            {
              symbol: 'fund:110022',
              name: '示例基金',
              groupId: 'builtin:fund',
              pinned: false,
              order: 0,
              price: 0,
              changePercent: 0,
              asOf: '',
              stale: true,
            },
          ],
        }),
      }),
    )
    const result = await svc.getWatchlist()
    expect(result.items[0]!.stale).toBe(true)
  })

  it('getHoldings 返回持仓视图', async () => {
    const svc = new MarketWatchRuntime(new Context(), makeData())
    const result = await svc.getHoldings()
    expect(result.items[0]!.profitRate).toBe(2.5)
  })

  it('getSettings 返回设置(可选字段 undefined 时仍通过 schema)', async () => {
    const svc = new MarketWatchRuntime(new Context(), makeData())
    const result = await svc.getSettings()
    expect(result.settings.intervalMs).toBe(5000)
    expect(result.settings.privacy.exposeAmounts).toBe(false)
  })

  it('schema 不匹配的数据被 parse 拒绝', async () => {
    const svc = new MarketWatchRuntime(
      new Context(),
      makeData({
        getWatchlistWithQuotes: async () => ({ items: [{ bad: 'shape' }] }),
      }),
    )
    await expect(svc.getWatchlist()).rejects.toThrow()
  })
})

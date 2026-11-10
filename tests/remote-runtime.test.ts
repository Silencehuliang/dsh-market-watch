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
          status: 'unknown',
          isFund: false,
        },
      ],
      groups: [{ id: 'builtin:a_stock', name: 'A股' }],
      sortMode: 'default' as const,
      riseColor: 'red' as const,
      settings: {
        intervalMs: 5000,
        riseColor: 'red' as const,
        privacy: { exposeAmounts: false },
        sortMode: 'default' as const,
        alertsEnabled: true,
        miniBarSymbols: [],
      },
    }),
    getHoldingsView: async () => ({
      items: [{ symbol: 'fund:110022', profitRate: 2.5, isClosed: false }],
    }),
    getSettingsView: () => ({
      intervalMs: 5000,
      riseColor: 'red',
      privacy: { exposeAmounts: false },
      sortMode: 'default',
      alertsEnabled: true,
      miniBarSymbols: [],
    }),
    searchSymbols: async () => ({
      items: [
        { symbol: 'cn_sh:600519', name: '贵州茅台', market: 'cn_sh', type: 'stock' },
        { symbol: 'fund:009265', name: '易方达消费精选股票', market: 'fund', type: 'fund' },
      ],
    }),
    addToWatchlist: async () => ({ ok: true, symbol: 'cn_sh:600519' }),
    removeFromWatchlist: async () => ({ ok: true, symbol: 'cn_sh:600519' }),
    setPinned: async () => ({ ok: true, symbol: 'cn_sh:600519' }),
    moveToGroup: async () => ({ ok: true, symbol: 'cn_sh:600519' }),
    setSortMode: async () => ({ ok: true, symbol: '' }),
    createGroup: async () => ({ ok: true, symbol: 'custom:测试' }),
    deleteGroup: async () => ({ ok: true, symbol: '' }),
    updateSettings: async () => ({ ok: true, symbol: '' }),
    ackAlerts: async () => ({ ok: true, symbol: '' }),
    getKline: async () => ({ symbol: 'cn_sh:600519', bars: [] }),
    getFundHistory: async () => ({ code: '110022', list: [] }),
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
              status: 'unknown',
              isFund: true,
            },
          ],
          groups: [{ id: 'builtin:fund', name: '基金' }],
          sortMode: 'default' as const,
          riseColor: 'red' as const,
          settings: {
            intervalMs: 5000,
            riseColor: 'red' as const,
            privacy: { exposeAmounts: false },
            sortMode: 'default' as const,
            alertsEnabled: true,
            miniBarSymbols: [],
          },
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

  it('search 返回经 schema 校验的候选', async () => {
    const svc = new MarketWatchRuntime(new Context(), makeData())
    const result = await svc.search('茅台')
    expect(result.items).toHaveLength(2)
    expect(result.items[0]!.symbol).toBe('cn_sh:600519')
  })

  it('addToWatchlist / removeFromWatchlist 返回操作结果', async () => {
    const svc = new MarketWatchRuntime(new Context(), makeData())
    const added = await svc.addToWatchlist('sz000001', '平安银行')
    expect(added.ok).toBe(true)
    const removed = await svc.removeFromWatchlist('sz000001')
    expect(removed.ok).toBe(true)
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

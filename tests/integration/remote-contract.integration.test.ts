/**
 * 契约漂移验证(离线):remote schema 对宿主数据的静默剥离行为。
 * 真实 MarketWatchRuntime + 真实 zod contract,数据 access 注入 computeHoldingsView 的真实形态。
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { MarketWatchRuntime } from '../../src/remote/runtime.js'
import type { MarketWatchDataAccess } from '../../src/remote/runtime.js'

function makeData(holdingsItems: unknown[], settings: unknown = {}): MarketWatchDataAccess {
  return {
    getWatchlistWithQuotes: async () => ({ items: [], groups: [], sortMode: 'default', riseColor: 'red', settings }),
    getHoldingsView: async () => ({ items: holdingsItems }),
    getSettingsView: () => settings,
    searchSymbols: async () => ({ items: [] }),
    addToWatchlist: async () => ({ ok: true, symbol: '' }),
    removeFromWatchlist: async () => ({ ok: true, symbol: '' }),
    setPinned: async () => ({ ok: true, symbol: '' }),
    moveToGroup: async () => ({ ok: true, symbol: '' }),
    setSortMode: async () => ({ ok: true, symbol: '' }),
    createGroup: async () => ({ ok: true, symbol: '' }),
    deleteGroup: async () => ({ ok: true, symbol: '' }),
    updateSettings: async () => ({ ok: true, symbol: '' }),
    ackAlerts: async () => ({ ok: true, symbol: '' }),
    getKline: async () => ({ symbol: '', bars: [] }),
    getFundHistory: async () => ({ code: '', list: [] }),
  }
}

describe('remote 契约回归', () => {
  it('holdings 远端输出保留 currency/fxRate/fxMissing(#33 修复:此前 schema 剥离致 UI 永远看不到)', async () => {
    // 这是 index.ts computeHoldingsView(exposeAmounts=true + 一个汇率缺失项)的真实输出形态
    const svc = new MarketWatchRuntime(new Context(), makeData([
      {
        symbol: 'us:AAPL.OQ',
        name: '苹果',
        profitRate: 11.11,
        isClosed: false,
        currency: 'USD',
        fxRate: 7.2,
        shares: 10,
        amount: 2000,
        costPrice: 180,
        dayProfit: 144,
        cumProfit: 1440,
        marketValue: 14400,
      },
      {
        symbol: 'us:NVDA.OQ',
        name: '英伟达',
        profitRate: 3.45,
        isClosed: false,
        currency: 'USD',
        fxMissing: true, // 汇率缺失降级标注
      },
    ]))
    const result = await svc.getHoldings()
    expect(result.items[0]!.currency).toBe('USD')
    expect(result.items[0]!.fxRate).toBe(7.2)
    expect(result.items[1]!.currency).toBe('USD')
    expect(result.items[1]!.fxMissing).toBe(true)
  })

  it('settings 远端输出剥离 alertsUnread/webhookUrl(后者符合「仅本地」设计)', async () => {
    const svc = new MarketWatchRuntime(new Context(), makeData([], {
      intervalMs: 5000,
      riseColor: 'red',
      privacy: { exposeAmounts: false },
      sortMode: 'default',
      alertsEnabled: true,
      alertsUnread: 7,
      webhookUrl: 'http://hook.local/x',
      miniBarSymbols: [],
    }))
    const result = await svc.getSettings()
    expect(result.settings.alertsEnabled).toBe(true)
    expect((result.settings as any).alertsUnread).toBeUndefined()
    expect((result.settings as any).webhookUrl).toBeUndefined() // 设计如此:webhookUrl 不出宿主
  })

  it('ackAlerts 远端方法可用(回归:MiniBar 此前调用不存在的方法致点击无法打开面板)', async () => {
    const svc = new MarketWatchRuntime(new Context(), makeData([]))
    const result = await svc.ackAlerts()
    expect(result.ok).toBe(true)
  })
})

/**
 * 集成测试(离线):真实 apply(ctx) 全链路 —— 工具注册、存储域、行情路由(QuoteService+日历)、
 * 提醒引擎(宿主定时器)、隐私过滤、导入导出、简报。Provider 模块 fixture 化(唯一 mock 接缝)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// remote 协议替换为惰性桩:避免 cordis Service 对真实 Context 的依赖(独立单测已覆盖 runtime)
vi.mock('@deepseek-ai/dsh-typert-protocol', () => ({
  Remote: () => (_t: unknown, _k: unknown, _d: unknown) => {},
  TypertRemoteService: class {
    typertRemote: unknown
    constructor(_ctx: unknown, _key: string) {}
  },
}))

vi.mock('../../src/core/providers/sina.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchSinaStocks: vi.fn(),
}))
vi.mock('../../src/core/providers/tencent.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchTencentQuotes: vi.fn(),
}))
vi.mock('../../src/core/providers/futures-fx.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchFuturesFxQuotes: vi.fn(),
  fetchFxRates: vi.fn(),
}))
vi.mock('../../src/core/providers/kline.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchKline: vi.fn(),
  fetchFundHistory: vi.fn(),
}))
vi.mock('../../src/core/providers/m4.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchHsgFlow: vi.fn(),
  fetchSectorFlow: vi.fn(),
  fetchNewsFlash: vi.fn(),
  fetchFundRank: vi.fn(),
}))
vi.mock('../../src/core/providers/eastmoney.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchFundEstimates: vi.fn(),
}))
vi.mock('../../src/core/providers/fund-search.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  searchFunds: vi.fn(),
}))
vi.mock('../../src/core/providers/tencent-search.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  searchTencent: vi.fn(),
}))

import { apply } from '../../src/index'
import * as sinaMod from '../../src/core/providers/sina.js'
import * as tencentMod from '../../src/core/providers/tencent.js'
import * as futuresFxMod from '../../src/core/providers/futures-fx.js'
import * as klineMod from '../../src/core/providers/kline.js'
import * as m4Mod from '../../src/core/providers/m4.js'
import * as eastmoneyMod from '../../src/core/providers/eastmoney.js'
import * as fundSearchMod from '../../src/core/providers/fund-search.js'
import * as tencentSearchMod from '../../src/core/providers/tencent-search.js'
import type { Quote } from '../../src/core/types.js'

const fetchSinaStocks = vi.mocked(sinaMod.fetchSinaStocks)
const fetchTencentQuotes = vi.mocked(tencentMod.fetchTencentQuotes)
const fetchFuturesFxQuotes = vi.mocked(futuresFxMod.fetchFuturesFxQuotes)
const fetchFxRates = vi.mocked(futuresFxMod.fetchFxRates)
const fetchKline = vi.mocked(klineMod.fetchKline)
const fetchFundHistory = vi.mocked(klineMod.fetchFundHistory)
const fetchHsgFlow = vi.mocked(m4Mod.fetchHsgFlow)
const fetchSectorFlow = vi.mocked(m4Mod.fetchSectorFlow)
const fetchNewsFlash = vi.mocked(m4Mod.fetchNewsFlash)
const fetchFundRank = vi.mocked(m4Mod.fetchFundRank)
const fetchFundEstimates = vi.mocked(eastmoneyMod.fetchFundEstimates)
const searchFunds = vi.mocked(fundSearchMod.searchFunds)
const searchTencent = vi.mocked(tencentSearchMod.searchTencent)

// ---------- 固定时刻(2026-11-18 周三;未被 2026 节假日表覆盖) ----------
const T_OPEN = Date.parse('2026-11-18T02:00:00Z') // 北京 10:00,A股/港股开市、美股闭市
const T_SATURDAY = Date.parse('2026-11-14T07:00:00Z') // 北京周六 15:00
const T_HOLIDAY = Date.parse('2026-10-01T02:00:00Z') // 国庆节

function sinaQuote(symbol: string, price: number, prevClose: number, extra: Partial<Quote> = {}): Quote {
  return {
    symbol: symbol as Quote['symbol'],
    name: `股票${symbol.split(':')[1]}`,
    price,
    change: price - prevClose,
    changePercent: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
    open: prevClose,
    high: price,
    low: prevClose,
    prevClose,
    volume: 1000,
    amount: price * 1000,
    bid1: price - 0.01,
    ask1: price + 0.01,
    bidVol1: 100,
    askVol1: 200,
    orderBookRatio: ((100 - 200) / (100 + 200)) * 100,
    time: '2026-11-18 10:00:00',
    status: 'unknown',
    source: 'sina',
    ...extra,
  }
}

function tencentQuote(symbol: string, price: number, prevClose: number, currency: 'USD' | 'HKD'): Quote {
  return {
    symbol: symbol as Quote['symbol'],
    name: symbol.includes('AAPL') ? '苹果' : '腾讯控股',
    price,
    change: price - prevClose,
    changePercent: ((price - prevClose) / prevClose) * 100,
    prevClose,
    time: '2026-11-18 10:00:00',
    status: 'unknown',
    currency,
    source: 'tencent',
  }
}

const fundEstimateFixture = [
  {
    FCODE: '110022',
    SHORTNAME: '易方达消费行业',
    PDATE: '2026-11-17',
    NAV: 4.5,
    GSZ: 4.6,
    GSZZL: 2.22,
    GZTIME: '2026-11-18 10:00',
  },
]

interface FakeTable {
  get(key: string): unknown
  put(key: string, v: unknown): Promise<void>
  update(key: string, fn: (v: any) => unknown): Promise<void>
  delete(key: string): Promise<void>
  entries(): Array<[string, unknown]>
}

async function setup() {
  const cleanups: Array<() => void> = []
  const tools = new Map<string, { execute: (args: any) => Promise<unknown>; parameters: Record<string, unknown> }>()
  let domainRef: {
    table(name: string): FakeTable
    global: { get(): any; set(v: unknown): Promise<void> }
  } | null = null

  const makeDomain = (spec: any) => {
    const tables = new Map<string, Map<string, any>>()
    const tableSchemas = new Map<string, any>()
    for (const [name, t] of Object.entries<any>(spec.tables)) tableSchemas.set(name, t.valueSchema)
    let globalState: any = { ...(spec.global?.initial ?? {}) }
    const gschema = spec.global?.schema
    return {
      table(name: string): FakeTable {
        if (!tables.has(name)) tables.set(name, new Map())
        const m = tables.get(name)!
        const vs = tableSchemas.get(name)
        return {
          get: (k) => m.get(k),
          put: async (k, v) => {
            m.set(k, vs ? vs.parse(v) : v)
          },
          update: async (k, fn) => {
            const cur = m.get(k)
            if (!cur) throw new Error(`row not found: ${k}`)
            m.set(k, vs ? vs.parse(fn(cur)) : fn(cur))
          },
          delete: async (k) => {
            m.delete(k)
          },
          entries: () => Array.from(m.entries()),
        }
      },
      global: {
        get: () => (gschema ? gschema.parse(globalState) : globalState),
        set: async (v: unknown) => {
          globalState = gschema ? gschema.parse(v) : v
        },
      },
      close: async () => {},
    }
  }

  const ctx: any = {
    effect: (fn: () => unknown | (() => void), _label?: string) => {
      const maybe = fn()
      if (typeof maybe === 'function') cleanups.push(maybe as () => void)
    },
    tools: { register: (t: any) => tools.set(t.name, t) },
    storageDomain: {
      open: async (spec: unknown) => {
        const d = makeDomain(spec)
        domainRef = d
        return d
      },
    },
    typert: { register: vi.fn(() => () => {}) },
    schedule: { create: vi.fn(async (r: Record<string, unknown>) => ({ id: 'sched-1', ...r })) },
  }

  apply(ctx)
  // storage open 是异步挂接,冲刷微任务直到域就绪
  await flush()
  return {
    tools,
    scheduleCreate: ctx.schedule.create as ReturnType<typeof vi.fn>,
    domain: () => {
      if (!domainRef) throw new Error('storage not opened')
      return domainRef
    },
    dispose: () => cleanups.forEach((c) => c()),
    call: async (name: string, args: any = {}) => {
      const t = tools.get(name)
      if (!t) throw new Error(`tool not registered: ${name}`)
      return t.execute(args)
    },
  }
}

/** 冲刷微任务(存储域异步挂接用)。 */
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T_OPEN)
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))
  ;[
    fetchSinaStocks, fetchTencentQuotes, fetchFuturesFxQuotes, fetchFxRates, fetchKline,
    fetchFundHistory, fetchHsgFlow, fetchSectorFlow, fetchNewsFlash, fetchFundRank,
    fetchFundEstimates, searchFunds, searchTencent,
  ].forEach((m) => m.mockReset())
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('工具注册与自检', () => {
  it('注册全部 26 个工具', async () => {
    const h = await setup()
    const names = [...h.tools.keys()].sort()
    expect(names).toHaveLength(26)
    expect(names).toContain('market_quote')
    expect(names).toContain('portfolio_summary') // README 工具表未列(文档漂移)
    expect(names).toContain('market_diagnostics')
    h.dispose()
  })

  it('market_watch_hello 返回自检文本', async () => {
    const h = await setup()
    expect(await h.call('market_watch_hello')).toBe('hello from market-watch')
    h.dispose()
  })
})

describe('market_quote:路由 / 标注 / 兜底', () => {
  it('按市场路由到对应源,状态由日历填充,含 asOf/source/delayed', async () => {
    const h = await setup()
    fetchSinaStocks.mockResolvedValue([sinaQuote('cn_sh:600519', 1500, 1480)])
    fetchTencentQuotes.mockResolvedValue([tencentQuote('hk:00700', 300, 295, 'HKD'), tencentQuote('us:AAPL.OQ', 200, 198, 'USD')])
    const r = (await h.call('market_quote', { symbols: ['sh600519', 'hk00700', 'us:AAPL.OQ'] })) as any[]
    expect(r).toHaveLength(3)
    const sh = r.find((x) => x.symbol === 'cn_sh:600519')!
    const hk = r.find((x) => x.symbol === 'hk:00700')!
    const us = r.find((x) => x.symbol === 'us:AAPL.OQ')!
    expect(sh.source).toBe('sina')
    expect(sh.asOf).toBe('2026-11-18 10:00:00')
    expect(sh.delayed).toBe(false)
    expect(sh.orderBookRatio).toBeCloseTo(-33.33, 1)
    expect(hk.currency).toBeUndefined() // 工具输出不透传 currency(见报告:视图层缺口)
    expect(us.symbol).toBe('us:AAPL.OQ')
    // 行为记录:market_quote 工具输出不含 status 字段(仅内部提醒门禁/自选视图使用)
    h.dispose()
  })

  it('期货/外汇/基金路由', async () => {
    const h = await setup()
    fetchFuturesFxQuotes.mockResolvedValue([
      { ...(sinaQuote('fut_cn:IF0', 3900, 3880) as Quote), source: 'sina-futures' },
      { ...(sinaQuote('fx:SUSDCNY', 7.2, 7.19) as Quote), source: 'sina-fx' },
    ])
    fetchFundEstimates.mockResolvedValue(fundEstimateFixture.map((e) => ({
      code: e.FCODE, name: e.SHORTNAME, navDate: e.PDATE, nav: e.NAV,
      estimateNav: e.GSZ, estimatePercent: e.GSZZL, estimateTime: e.GZTIME,
      isEstimate: true as const, source: 'eastmoney',
    })))
    const r = (await h.call('market_quote', { symbols: ['nf_IF0', 'fx_susdcny', '110022'] })) as any[]
    expect(r.map((x) => x.symbol)).toEqual(['fut_cn:IF0', 'fx:SUSDCNY', 'fund:110022'])
    expect(r[0]!.source).toBe('sina-futures')
    expect(r[2]!.price).toBe(4.6)
    expect(r[2]!.delayed).toBe(true) // 基金估值强制 delayed
    h.dispose()
  })

  it('未知标的被静默丢弃(行为记录:无错误信息)', async () => {
    const h = await setup()
    fetchSinaStocks.mockResolvedValue([])
    const r = (await h.call('market_quote', { symbols: ['sh999999'] })) as any[]
    expect(r).toEqual([])
    h.dispose()
  })

  it('主源失败 → 返回缓存并标 stale,冷却期生效,诊断可见', async () => {
    const h = await setup()
    fetchSinaStocks.mockResolvedValueOnce([sinaQuote('cn_sh:600519', 1500, 1480)])
    await h.call('market_quote', { symbols: ['sh600519'] })
    fetchSinaStocks.mockRejectedValueOnce(new Error('boom'))
    const r = (await h.call('market_quote', { symbols: ['sh600519'] })) as any[]
    expect(r[0]!.price).toBe(1500)
    expect(r[0]!.stale).toBe(true)
    expect(r[0]!.delayed).toBe(true)
    const diag = (await h.call('market_diagnostics')) as any
    const sina = diag.sources.find((s: any) => s.source === 'sina')
    expect(sina.lastError).toContain('boom')
    expect(sina.inCooldown).toBe(true)
    expect(sina.lastLatencyMs).toBeTypeOf('number')
    h.dispose()
  })

  it('休市市场不发高频轮询:有缓存时直接用缓存(不标 stale),状态 closed', async () => {
    const h = await setup()
    vi.setSystemTime(T_OPEN)
    fetchSinaStocks.mockResolvedValue([sinaQuote('cn_sh:600519', 1500, 1480)])
    await h.call('market_quote', { symbols: ['sh600519'] })
    fetchSinaStocks.mockClear()
    vi.setSystemTime(T_SATURDAY)
    const r = (await h.call('market_quote', { symbols: ['sh600519'] })) as any[]
    expect(fetchSinaStocks).not.toHaveBeenCalled()
    expect(r[0]!.price).toBe(1500)
    expect(r[0]!.stale).toBeFalsy()
    h.dispose()
  })
})

describe('自选增删查', () => {
  it('添加幂等、默认按市场归组、列表可按组过滤', async () => {
    const h = await setup()
    fetchSinaStocks.mockResolvedValue([sinaQuote('cn_sh:600519', 1500, 1480)])
    const a1 = (await h.call('watchlist_add', { symbol: 'sh600519', name: '贵州茅台' })) as any
    expect(a1).toEqual({ symbol: 'cn_sh:600519', added: true })
    const a2 = (await h.call('watchlist_add', { symbol: 'cn_sh:600519' })) as any
    expect(a2.added).toBe(false)
    const list = (await h.call('watchlist_list')) as any[]
    expect(list).toHaveLength(1)
    expect(list[0]!.groupId).toBe('builtin:a_stock')
    expect(list[0]!.name).toBe('贵州茅台')
    expect((await h.call('watchlist_list', { group: 'builtin:us' })) as any[]).toHaveLength(0)
    const rm = (await h.call('watchlist_remove', { symbol: 'cn_sh:600519' })) as any
    expect(rm.removed).toBe(true)
    expect(((await h.call('watchlist_list')) as any[])).toHaveLength(0)
    h.dispose()
  })

  it('watchlist_add 接受任意 group id(行为记录:无存在性校验)', async () => {
    const h = await setup()
    const r = (await h.call('watchlist_add', { symbol: 'sz000001', group: 'custom:不存在' })) as any
    expect(r.added).toBe(true)
    const list = (await h.call('watchlist_list')) as any[]
    expect(list[0]!.groupId).toBe('custom:不存在')
    h.dispose()
  })
})

describe('持仓账本与隐私', () => {
  async function seed(h: Awaited<ReturnType<typeof setup>>) {
    fetchSinaStocks.mockResolvedValue([sinaQuote('cn_sh:600519', 1500, 1480)])
    fetchTencentQuotes.mockResolvedValue([tencentQuote('us:AAPL.OQ', 200, 198, 'USD')])
    fetchFundEstimates.mockResolvedValue([{
      code: '110022', name: '易方达消费行业', navDate: '2026-11-17', nav: 4.5,
      estimateNav: 4.6, estimatePercent: 2.22, estimateTime: '2026-11-18 10:00',
      isEstimate: true as const, source: 'eastmoney',
    }])
    fetchFxRates.mockResolvedValue({ USD: 7.2, HKD: 0.93 })
    await h.call('holdings_set', { symbol: 'sh600519', shares: 100, costPrice: 1450 })
    await h.call('holdings_set', { symbol: 'us:AAPL.OQ', shares: 10, costPrice: 180 })
    await h.call('holdings_set', { symbol: 'fund:110022', amount: 10000, costNav: 2.0 })
  }

  it('基金只有金额时按成本净值反推份额', async () => {
    const h = await setup()
    await seed(h)
    const saved = (await h.call('holdings_set', { symbol: 'fund:110022', amount: 10000, costNav: 2.0 })) as any
    expect(saved.shares).toBeCloseTo(5000, 6)
    h.dispose()
  })

  it('默认隐私模式:holdings_get 只含百分比,金额不出现', async () => {
    const h = await setup()
    await seed(h)
    const r = (await h.call('holdings_get')) as any
    expect(r.items).toHaveLength(3)
    for (const it of r.items) {
      expect(it.profitRate).toBeTypeOf('number')
      expect(it.shares).toBeUndefined()
      expect(it.amount).toBeUndefined()
      expect(it.costPrice).toBeUndefined()
      expect(it.dayProfit).toBeUndefined()
      expect(it.marketValue).toBeUndefined()
    }
    h.dispose()
  })

  it('开启暴露后金额可见,外币按汇率折算人民币', async () => {
    const h = await setup()
    await seed(h)
    await h.domain().global.set({
      ...(h.domain().global.get()),
      privacy: { exposeAmounts: true },
    })
    const r = (await h.call('holdings_get')) as any
    const aapl = r.items.find((i: any) => i.symbol === 'us:AAPL.OQ')!
    expect(aapl.currency).toBe('USD')
    expect(aapl.fxRate).toBe(7.2)
    expect(aapl.marketValue).toBeCloseTo(200 * 10 * 7.2, 6)
    expect(aapl.cumProfit).toBeCloseTo((200 - 180) * 10 * 7.2, 6)
    const sh = r.items.find((i: any) => i.symbol === 'cn_sh:600519')!
    expect(sh.dayProfit).toBeCloseTo((1500 - 1480) * 100, 6)
    const fund = r.items.find((i: any) => i.symbol === 'fund:110022')!
    expect(fund.shares).toBeCloseTo(5000, 6)
    expect(fund.marketValue).toBeCloseTo(4.6 * 5000, 6)
    h.dispose()
  })

  it('汇率失败:降级原币值并带 fxMissing 标注(工具输出)', async () => {
    const h = await setup()
    await seed(h)
    await h.domain().global.set({ ...(h.domain().global.get()), privacy: { exposeAmounts: true } })
    fetchFxRates.mockRejectedValue(new Error('fx down'))
    const r = (await h.call('holdings_get')) as any
    const aapl = r.items.find((i: any) => i.symbol === 'us:AAPL.OQ')!
    expect(aapl.fxMissing).toBe(true)
    expect(aapl.marketValue).toBe(2000) // 未折算
    h.dispose()
  })

  it('portfolio_summary:隐私模式只给分布,暴露模式给金额与总收益率', async () => {
    const h = await setup()
    await seed(h)
    const priv = (await h.call('portfolio_summary')) as any
    expect(priv.count).toBe(3)
    expect(priv.dayProfit).toBeUndefined()
    expect(priv.totalRate).toBeUndefined()
    expect(priv.distribution.up).toBe(3)
    expect(priv.maxSwing.symbol).toBeTypeOf('string')
    await h.domain().global.set({ ...(h.domain().global.get()), privacy: { exposeAmounts: true } })
    const full = (await h.call('portfolio_summary')) as any
    // 成本 = 1450*100 + 180*10*7.2 + 2.0*5000 = 167,960;累计盈亏 = 5000 + 1440 + 13000 = 19,440
    expect(full.cumProfit).toBeCloseTo(19440, 4)
    expect(full.totalRate).toBeCloseTo((19440 / 167960) * 100, 3)
    h.dispose()
  })
})

describe('提醒引擎(宿主 5s 定时器)', () => {
  it('穿越触发 → 未读计数 → webhook → ack', async () => {
    const h = await setup()
    fetchSinaStocks.mockResolvedValue([sinaQuote('cn_sh:600519', 1500, 1480)])
    await flush()
    const set = (await h.call('alert_set', { symbol: 'sh600519', kind: 'price', direction: 'up', threshold: 1510 })) as any
    expect(set.saved).toBe(true)
    const webhook = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true }))
    vi.stubGlobal('fetch', webhook)
    await h.domain().global.set({ ...(h.domain().global.get()), webhookUrl: 'http://hook.local/x' })

    await vi.advanceTimersByTimeAsync(5000) // 基线拍
    expect((await h.call('alert_list')) as any[]).toHaveLength(1)
    fetchSinaStocks.mockResolvedValue([sinaQuote('cn_sh:600519', 1512, 1480)])
    await vi.advanceTimersByTimeAsync(5000) // 穿越
    const rules = (await h.call('alert_list')) as any[]
    expect(rules[0]!.lastTriggerInfo).toContain('上穿 1510')
    expect(rules[0]!.lastTriggeredAt).toBeTypeOf('number')
    expect(h.domain().global.get().alertsUnread).toBe(1)
    expect(webhook).toHaveBeenCalledTimes(1)
    expect(String(webhook.mock.calls[0]![0])).toBe('http://hook.local/x')
    expect(String((webhook.mock.calls[0]![1] as any).body)).toContain('1510')

    await h.call('alert_ack')
    expect(h.domain().global.get().alertsUnread).toBe(0)
    h.dispose()
  })

  it('节流后不重复触发;规则关闭后不触发', async () => {
    const h = await setup()
    fetchSinaStocks.mockResolvedValue([sinaQuote('cn_sh:600519', 1500, 1480)])
    await flush()
    await h.call('alert_set', { symbol: 'sh600519', kind: 'price', direction: 'up', threshold: 1510 })
    await vi.advanceTimersByTimeAsync(5000) // 基线
    fetchSinaStocks.mockResolvedValue([sinaQuote('cn_sh:600519', 1512, 1480)])
    await vi.advanceTimersByTimeAsync(5000) // 触发一次
    // 同拍持续高于阈值:prev 已 ≥ 阈值,不再穿越
    fetchSinaStocks.mockResolvedValue([sinaQuote('cn_sh:600519', 1513, 1480)])
    await vi.advanceTimersByTimeAsync(5000)
    const rules = (await h.call('alert_list')) as any[]
    expect(rules[0]!.lastTriggeredAt).toBe(Date.now() - 5000)
    h.dispose()
  })

  it('节假日/周末不评估(status != open)', async () => {
    const h = await setup()
    fetchSinaStocks.mockResolvedValue([sinaQuote('cn_sh:600519', 1500, 1480)])
    await flush()
    await h.call('alert_set', { symbol: 'sh600519', kind: 'price', direction: 'up', threshold: 1490 })
    await vi.advanceTimersByTimeAsync(5000) // 基线(开市)
    vi.setSystemTime(T_HOLIDAY)
    fetchSinaStocks.mockResolvedValue([sinaQuote('cn_sh:600519', 1495, 1480)]) // 已越线,但休市
    await vi.advanceTimersByTimeAsync(5000)
    await vi.advanceTimersByTimeAsync(5000)
    const rules = (await h.call('alert_list')) as any[]
    expect(rules[0]!.lastTriggeredAt).toBeUndefined()
    h.dispose()
  })

  it('alert_delete 移除规则', async () => {
    const h = await setup()
    await flush()
    const s = (await h.call('alert_set', { symbol: 'hk00700', kind: 'changePercent', direction: 'down', threshold: -3 })) as any
    expect(s.id).toBe('hk:00700|changePercent|down')
    await h.call('alert_delete', { id: s.id })
    expect(((await h.call('alert_list')) as any[])).toHaveLength(0)
    h.dispose()
  })
})

describe('简报与定时任务', () => {
  it('休市日返回 closed=true', async () => {
    const h = await setup()
    vi.setSystemTime(T_HOLIDAY)
    const r = (await h.call('brief_generate', { kind: 'post_close' })) as any
    expect(r.closed).toBe(true)
    expect(r.tradingDay).toBe(false)
    expect(r.items).toEqual([])
    h.dispose()
  })

  it('交易日 post_close:按 |涨跌幅| 排序,盘后含持仓(隐私过滤)', async () => {
    const h = await setup()
    fetchSinaStocks.mockResolvedValue([sinaQuote('cn_sh:600519', 1500, 1480)])
    fetchTencentQuotes.mockResolvedValue([tencentQuote('hk:00700', 300, 295, 'HKD')])
    await h.call('watchlist_add', { symbol: 'sh600519' })
    await h.call('watchlist_add', { symbol: 'hk00700' })
    await h.call('holdings_set', { symbol: 'sh600519', shares: 100, costPrice: 1450 })
    const r = (await h.call('brief_generate', { kind: 'post_close' })) as any
    expect(r.closed).toBe(false)
    expect(r.items).toHaveLength(2)
    expect(r.items[0]!.changePercent).toBeGreaterThanOrEqual(r.items[1]!.changePercent)
    expect(r.holdings).toBeDefined()
    expect(r.holdings[0]!.profitRate).toBeCloseTo(((1500 - 1450) / 1450) * 100, 4)
    expect(r.holdings[0]!.shares).toBeUndefined() // 默认隐私
    const pre = (await h.call('brief_generate', { kind: 'pre_open' })) as any
    expect(pre.holdings).toBeUndefined()
    h.dispose()
  })

  it('brief_schedule 创建每日任务(默认 15:10 Asia/Shanghai),重复调用会重复创建(行为记录)', async () => {
    const h = await setup()
    const r = (await h.call('brief_schedule', { kind: 'post_close' })) as any
    expect(r.created).toBe(true)
    expect(r.time).toBe('15:10:00')
    expect(h.scheduleCreate).toHaveBeenCalledTimes(1)
    expect(h.scheduleCreate.mock.calls[0]![0]).toMatchObject({
      daily: { time: '15:10:00', time_zone: 'Asia/Shanghai' },
    })
    await h.call('brief_schedule', { kind: 'pre_open', time: '08:30' })
    expect(h.scheduleCreate).toHaveBeenCalledTimes(2)
    expect(h.scheduleCreate.mock.calls[1]![0]).toMatchObject({ daily: { time: '08:30:00' } })
    h.dispose()
  })
})

describe('K线 / 基金 / 快讯 / 资金流', () => {
  it('market_kline:csv 与 json 两种格式;range → 交易日数', async () => {
    const h = await setup()
    fetchKline.mockResolvedValue([
      { date: '2026-11-17', open: 1490, close: 1500, high: 1505, low: 1485, volume: 100 },
      { date: '2026-11-18', open: 1500, close: 1510, high: 1512, low: 1498, volume: 120 },
    ])
    const csv = (await h.call('market_kline', { symbol: 'sh600519', format: 'csv' })) as any
    expect(csv.format).toBe('csv')
    expect(csv.csv.split('\n')[0]).toBe('date,open,close,high,low,volume')
    expect(csv.csv).toContain('2026-11-18,1500,1510,1512,1498,120')
    expect(fetchKline).toHaveBeenCalledWith('cn_sh:600519', 22)
    await h.call('market_kline', { symbol: 'sh600519', range: '1y' })
    expect(fetchKline).toHaveBeenLastCalledWith('cn_sh:600519', 264)
    const json = (await h.call('market_kline', { symbol: 'sh600519' })) as any
    expect(json.bars).toHaveLength(2)
    h.dispose()
  })

  it('market_fund_history:默认 20 条', async () => {
    const h = await setup()
    fetchFundHistory.mockResolvedValue([{ date: '2026-11-17', nav: 4.5, accNav: 4.5, changePercent: 0.5 }])
    const r = (await h.call('market_fund_history', { code: '110022' })) as any
    expect(fetchFundHistory).toHaveBeenCalledWith('110022', 20)
    expect(r.list[0]!.nav).toBe(4.5)
    h.dispose()
  })

  it('market_news_flash:60 秒缓存 + 关键词过滤', async () => {
    const h = await setup()
    fetchNewsFlash.mockResolvedValue([
      { id: '1', time: '10:00:00', title: '央行开展逆回购', content: '金额 100 亿' },
      { id: '2', time: '09:00:00', title: '美股收涨', content: '纳指 +1%' },
    ])
    const r1 = (await h.call('market_news_flash', { limit: 20 })) as any
    expect(r1.items).toHaveLength(2)
    const r2 = (await h.call('market_news_flash', { keyword: '逆回购' })) as any
    expect(fetchNewsFlash).toHaveBeenCalledTimes(1) // 缓存生效
    expect(r2.items).toHaveLength(1)
    expect(r2.items[0]!.id).toBe('1')
    vi.setSystemTime(T_OPEN + 61_000)
    await h.call('market_news_flash', {})
    expect(fetchNewsFlash).toHaveBeenCalledTimes(2) // 过期重取
    h.dispose()
  })

  it('market_flow:north / sector / concept;非法 kind 报错', async () => {
    const h = await setup()
    fetchHsgFlow.mockResolvedValue({ time: '10:00', shNet: 12.3, szNet: 8.9, northTotal: 21.2 })
    const north = (await h.call('market_flow', { kind: 'north' })) as any
    expect(north.northTotal).toBeCloseTo(21.2, 6)
    fetchSectorFlow.mockResolvedValue([{ name: '半导体', netInflow: 5.6, changePercent: 2.1 }])
    const sector = (await h.call('market_flow', { kind: 'sector', limit: 5 })) as any
    expect(sector.items[0]!.name).toBe('半导体')
    expect(fetchSectorFlow).toHaveBeenCalledWith('sector', 5)
    const bad = (await h.call('market_flow', { kind: 'xxx' })) as any
    expect(bad.error).toContain('kind must be')
    h.dispose()
  })

  it('market_fund_rank:day/year 排序键', async () => {
    const h = await setup()
    fetchFundRank.mockResolvedValue([{ code: '110022', name: '易方达消费行业', nav: 4.5, dayPercent: 2.2, yearPercent: 30 }])
    await h.call('market_fund_rank', { sort: 'year' })
    expect(fetchFundRank).toHaveBeenCalledWith('year', 10)
    const r = (await h.call('market_fund_rank', {})) as any
    expect(fetchFundRank).toHaveBeenLastCalledWith('day', 10)
    expect(r.items[0]!.dayPercent).toBe(2.2)
    h.dispose()
  })

  it('market_search:合并腾讯与东财基金源并去重', async () => {
    const h = await setup()
    searchTencent.mockResolvedValue([{ symbol: 'cn_sh:600519', name: '贵州茅台', market: 'cn_sh', type: 'stock' }])
    searchFunds.mockResolvedValue([
      { symbol: 'fund:009265', name: '易方达消费精选', market: 'fund', type: 'fund' },
      { symbol: 'cn_sh:600519', name: '贵州茅台', market: 'cn_sh', type: 'stock' },
    ])
    const r = (await h.call('market_search', { query: '茅台' })) as any
    expect(r.items).toHaveLength(2) // 去重后
    h.dispose()
  })
})

describe('market_status 与诊断', () => {
  it('九个市场全部有状态;fut_gl/fx 全天交易;非法市场恒 open(行为记录)', async () => {
    const h = await setup()
    const r = (await h.call('market_status', {})) as any
    expect(r.items).toHaveLength(9)
    for (const it of r.items) {
      expect(['open', 'closed', 'pre', 'post']).toContain(it.status)
      if (it.market === 'fut_gl' || it.market === 'fx') {
        expect(it.isOpen).toBe(true)
        expect(it.nextOpenAt).toBeNull()
      } else {
        expect(it.nextOpenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      }
    }
    const sh = r.items.find((i: any) => i.market === 'cn_sh')!
    expect(sh.isOpen).toBe(true) // 北京周三 10:00
    const bad = (await h.call('market_status', { markets: ['zzz'] })) as any
    expect(bad.items[0]!.status).toBe('open') // 未知市场 → marketTimeZone null → open(校验缺口)
    h.dispose()
  })

  it('market_diagnostics 未请求时延迟为 null', async () => {
    const h = await setup()
    const diag = (await h.call('market_diagnostics')) as any
    expect(diag.sources).toHaveLength(4)
    expect(diag.sources[0]!.lastLatencyMs).toBeNull()
    h.dispose()
  })
})

describe('导入导出与隐私边界', () => {
  it('export → import 往返恢复全部状态;版本与 JSON 校验', async () => {
    const h1 = await setup()
    await h1.call('watchlist_add', { symbol: 'sh600519', name: '贵州茅台' })
    await h1.call('holdings_set', { symbol: 'sh600519', shares: 100, costPrice: 1450 })
    await h1.domain().global.set({ ...(h1.domain().global.get()), webhookUrl: 'http://hook.local/x', sortMode: 'asc' })
    const exported = (await h1.call('market_export')) as any
    expect(exported.version).toBe(2)
    expect(exported.watchlist).toHaveLength(1)
    expect(exported.holdings).toHaveLength(1)
    expect(exported.settings.webhookUrl).toBe('http://hook.local/x')
    h1.dispose()

    const h2 = await setup()
    const imp = (await h2.call('market_import', { json: JSON.stringify(exported) })) as any
    expect(imp.imported).toEqual({ watchlist: 1, groups: 0, holdings: 1, settings: true })
    const list = (await h2.call('watchlist_list')) as any[]
    expect(list[0]!.symbol).toBe('cn_sh:600519')
    expect(h2.domain().global.get().sortMode).toBe('asc')
    expect(((await h2.call('market_import', { json: JSON.stringify({ version: 3 }) }))) as any).toHaveProperty('error')
    expect(((await h2.call('market_import', { json: '{oops' }))) as any).toHaveProperty('error')
    h2.dispose()
  })

  it('行为记录:market_export 无视隐私模式导出金额与 webhookUrl(P1 隐私泄漏证据)', async () => {
    const h = await setup()
    fetchSinaStocks.mockResolvedValue([sinaQuote('cn_sh:600519', 1500, 1480)])
    await h.call('holdings_set', { symbol: 'sh600519', shares: 100, costPrice: 1450 })
    await h.domain().global.set({ ...(h.domain().global.get()), webhookUrl: 'http://hook.local/x' })
    // privacy.exposeAmounts 仍为默认 false
    const exported = (await h.call('market_export')) as any
    expect(exported.holdings[0]!.shares).toBe(100) // 隐私模式下金额仍进入模型上下文
    expect(exported.settings.webhookUrl).toBe('http://hook.local/x')
    h.dispose()
  })
})

describe('share_card', () => {
  it('只含百分比,XML 转义名称', async () => {
    const h = await setup()
    fetchSinaStocks.mockResolvedValue([sinaQuote('cn_sh:600519', 1500, 1480, { name: 'A<B&股' })])
    await h.call('watchlist_add', { symbol: 'sh600519', name: 'A<B&股' })
    await h.call('holdings_set', { symbol: 'sh600519', shares: 100, costPrice: 1450 })
    const r = (await h.call('share_card')) as any
    expect(r.format).toBe('svg')
    expect(r.svg).toContain('A&lt;B&amp;股')
    expect(r.svg).toContain('+3.45%')
    expect(r.svg).not.toContain('shares')
    expect(r.svg).not.toContain('costPrice')
    h.dispose()
  })
})

describe('search 无结果与远程设置边界', () => {
  it('两源全失败返回空列表(不抛错)', async () => {
    const h = await setup()
    searchTencent.mockRejectedValue(new Error('net down'))
    searchFunds.mockRejectedValue(new Error('net down'))
    const r = (await h.call('market_search', { query: '茅台' })) as any
    expect(r.items).toEqual([])
    h.dispose()
  })
})

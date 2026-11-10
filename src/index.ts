import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { QuoteService } from './core/quote-service.js'
import { fetchSinaStocks } from './core/providers/sina.js'
import { fetchTencentQuotes } from './core/providers/tencent.js'
import { fetchFuturesFxQuotes, fetchFxRates } from './core/providers/futures-fx.js'
import { fetchFundEstimates } from './core/providers/eastmoney.js'
import { normalizeSymbol, parseSymbol } from './core/symbol.js'
import { isMarketOpenNow, isTradingDay, marketStatus } from './core/calendar.js'
import { searchSymbols } from './core/search.js'
import { evaluatePosition, sharesFromAmount } from './core/portfolio.js'
import { evaluateRule } from './core/alerts.js'
import { BUILTIN_GROUPS, groupForMarket, sortWatchItems } from './core/watchlist-sort.js'
import type { PositionResult } from './core/portfolio.js'
import type { Quote, SymbolId } from './core/types.js'
import { MarketWatchRuntime } from './remote/runtime.js'
import type { MarketWatchDataAccess } from './remote/runtime.js'
import { TYPERT_MANIFEST } from './remote/typert.js'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'

export const name = 'market-watch'
export const inject = ['tools', 'storageDomain', 'typert', 'schedule']

const marketWatchSpec = defineDomain({
  name: 'market_watch',
  version: 1, // 新增 groups 表 + global.sortMode(default 填充)均向后兼容,记录格式未变,不 bump(实测 bump 会 fatal version-mismatch,见 verification.md §11)
  tables: {
    watchlist: domainTable(
      z.object({
        symbol: z.string(),
        name: z.string(),
        groupId: z.string(),
        pinned: z.boolean(),
        order: z.number(),
        addedAt: z.string(),
      }),
    ),
    holdings: domainTable(
      z.object({
        shares: z.number().optional(),
        amount: z.number().optional(),
        costPrice: z.number().optional(),
        costNav: z.number().optional(),
        currency: z.string().optional(),
        closed: z.boolean().optional(),
        updatedAt: z.string(),
      }),
    ),
    groups: domainTable(
      z.object({
        name: z.string(),
        order: z.number(),
      }),
    ),
    alerts: domainTable(
      z.object({
        symbol: z.string(),
        kind: z.enum(['price', 'changePercent']),
        direction: z.enum(['up', 'down']),
        threshold: z.number(),
        enabled: z.boolean(),
        lastTriggeredAt: z.number().optional(),
        lastTriggerInfo: z.string().optional(),
        createdAt: z.string(),
      }),
    ),
  },
  global: {
    schema: z.object({
      intervalMs: z.number().min(3000).max(60000),
      riseColor: z.enum(['red', 'green']),
      privacy: z.object({ exposeAmounts: z.boolean() }),
      // default 保证 v1 存量 global(无 sortMode)通过 v2 校验(FR-CFG-03)
      sortMode: z.enum(['default', 'asc', 'desc']).default('default'),
      alertsEnabled: z.boolean().default(true),
      alertsUnread: z.number().default(0),
      miniBarSymbols: z.array(z.string()).default([]),
    }),
    initial: {
      intervalMs: 5000,
      riseColor: 'red',
      privacy: { exposeAmounts: false },
      sortMode: 'default' as const,
      alertsEnabled: true,
      miniBarSymbols: [],
    },
  },
})

function defaultGroup(symbolId: string): string {
  return groupForMarket(parseSymbol(symbolId as never).market)
}

/** 序列化去除 undefined 字段(JsonValue 不允许 undefined)。 */
function toJson(v: unknown): any {
  return JSON.parse(JSON.stringify(v))
}

/** 统一的 JSON 工具输出定义。 */
const jsonOutput = {
  schema: { type: 'json' as const },
  render: (_a: unknown, v: unknown) => [{ type: 'text' as const, text: JSON.stringify(v) }],
}

/** 统一的文本工具输出定义。 */
const textOutput = {
  schema: { type: 'string' as const },
  render: (_a: unknown, v: string) => [{ type: 'text' as const, text: v }],
}

export function apply(ctx: Context) {
  let domain: Domain<typeof marketWatchSpec> | undefined

  void ctx.storageDomain.open(marketWatchSpec).then((d) => {
    domain = d
    ctx.effect(() => () => {
      void d.close()
    })
  })

  const stockQuotes = new QuoteService(fetchSinaStocks)
  /** 港股/美股(腾讯,T21)。 */
  const overseasQuotes = new QuoteService(fetchTencentQuotes)
  /** 期货/外汇(新浪,T22)。 */
  const futuresFxQuotes = new QuoteService(fetchFuturesFxQuotes)

  /** 基金估值转 Quote 形态:price = 估值(盘中)或昨日净值(收盘后)。 */
  const fundQuotes = new QuoteService(async (symbols) => {
    const codeToSymbol = new Map(symbols.map((s) => [parseSymbol(s).code, s] as const))
    const estimates = await fetchFundEstimates([...codeToSymbol.keys()])
    return estimates.map((e) => ({
      symbol: codeToSymbol.get(e.code)!,
      name: e.name,
      price: e.estimateNav ?? e.nav ?? 0,
      change: 0,
      changePercent: e.estimatePercent ?? 0,
      prevClose: e.nav ?? 0,
      time: e.estimateTime ?? e.navDate,
      status: 'unknown',
      source: e.source,
      delayedSec: 120, // 基金估值延迟约 2 分钟
    }))
  })

  /** 按 market 路由:A股走 sina、港股/美股走腾讯、基金走东财。休市市场不发网络请求(FR-DATA-07),用缓存收盘价;无缓存的标的强制取一次。 */
  async function getQuotes(symbols: SymbolId[]): Promise<Quote[]> {
    const now = new Date()
    const open: SymbolId[] = []
    const closed: SymbolId[] = []
    for (const s of symbols) {
      ;(isMarketOpenNow(parseSymbol(s).market, now) ? open : closed).push(s)
    }
    const closedCached = [
      ...stockQuotes.peekCached(closed.filter((s) => ['cn_sh', 'cn_sz', 'cn_bj'].includes(parseSymbol(s).market))),
      ...overseasQuotes.peekCached(closed.filter((s) => ['hk', 'us'].includes(parseSymbol(s).market))),
      ...futuresFxQuotes.peekCached(closed.filter((s) => ['fut_cn', 'fut_gl', 'fx'].includes(parseSymbol(s).market))),
      ...fundQuotes.peekCached(closed.filter((s) => parseSymbol(s).market === 'fund')),
    ]
    const cachedIds = new Set(closedCached.map((q) => q.symbol))
    const fetchSymbols = [...open, ...closed.filter((s) => !cachedIds.has(s))]
    const cnStocks = fetchSymbols.filter((s) => ['cn_sh', 'cn_sz', 'cn_bj'].includes(parseSymbol(s).market))
    const overseas = fetchSymbols.filter((s) => ['hk', 'us'].includes(parseSymbol(s).market))
    const futuresFx = fetchSymbols.filter((s) => ['fut_cn', 'fut_gl', 'fx'].includes(parseSymbol(s).market))
    const funds = fetchSymbols.filter((s) => parseSymbol(s).market === 'fund')
    const [stockRes, overseasRes, futuresFxRes, fundRes] = await Promise.allSettled([
      cnStocks.length ? stockQuotes.getQuotes(cnStocks) : Promise.resolve([] as Quote[]),
      overseas.length ? overseasQuotes.getQuotes(overseas) : Promise.resolve([] as Quote[]),
      futuresFx.length ? futuresFxQuotes.getQuotes(futuresFx) : Promise.resolve([] as Quote[]),
      funds.length ? fundQuotes.getQuotes(funds) : Promise.resolve([] as Quote[]),
    ])
    const out: Quote[] = [...closedCached]
    if (stockRes.status === 'fulfilled') out.push(...stockRes.value)
    if (overseasRes.status === 'fulfilled') out.push(...overseasRes.value)
    if (futuresFxRes.status === 'fulfilled') out.push(...futuresFxRes.value)
    if (fundRes.status === 'fulfilled') out.push(...fundRes.value)
    // 由交易日历填充 status(FR-DATA-07):open/closed/pre/post
    return out.map((q) => ({ ...q, status: marketStatus(parseSymbol(q.symbol).market, now) }))
  }

  /** 收盘保持:上次盈亏结果缓存(price≤0 时 evaluatePosition 保持它)。 */
  const prevResults = new Map<SymbolId, PositionResult>()

  // ---------- 提醒评估引擎(T24:宿主定时器,FR-ALERT-02/03/05) ----------

  /** 上一次的监控值(穿越判定用;重启后首拍跳过)。 */
  const prevAlertValues = new Map<string, number>()

  async function evaluateAlerts(): Promise<void> {
    if (!domain) return
    const settings = domain.global.get()
    if (!settings.alertsEnabled) return
    const rules = Array.from(domain.table('alerts').entries()).filter(([, r]) => r.enabled)
    if (rules.length === 0) return
    const symbols = [...new Set(rules.map(([, r]) => r.symbol))] as never[]
    const quotes = await getQuotes(symbols)
    const bySymbol = new Map(quotes.map((q) => [q.symbol, q]))
    const now = Date.now()
    for (const [id, rule] of rules) {
      const q = bySymbol.get(rule.symbol as never)
      // FR-ALERT-02:仅在开市时评估(status 由交易日历填充)
      if (!q || q.status !== 'open') continue
      const current = rule.kind === 'price' ? q.price : q.changePercent
      const prev = prevAlertValues.get(id)
      prevAlertValues.set(id, current)
      if (prev === undefined) continue // 首拍只有基线,无从穿越
      const fired = evaluateRule(
        {
          id,
          kind: rule.kind,
          direction: rule.direction,
          threshold: rule.threshold,
          enabled: rule.enabled,
          lastTriggeredAt: rule.lastTriggeredAt,
        },
        prev,
        current,
        { now, throttleMs: 180_000, marketOpen: true }, // FR-ALERT-03 节流
      )
      if (fired) {
        const info = `${rule.symbol} ${rule.kind === 'price' ? '价格' : '涨跌幅'}${rule.direction === 'up' ? '上穿' : '下穿'} ${rule.threshold},当前 ${current.toFixed(2)}`
        await domain.table('alerts').update(id as never, (r) => ({
          ...r,
          lastTriggeredAt: now,
          lastTriggerInfo: info,
        }))
        await setGlobal({
          alertsUnread:
            ((domain.global.get() as unknown as { alertsUnread?: number }).alertsUnread ?? 0) + 1,
        })
        console.log(`[market-watch] alert fired: ${info}`)
      }
    }
  }

  ctx.effect(() => {
    // FR-ALERT-05:禁止用 dsh schedule 做轮询——宿主定时器驱动
    const timer = setInterval(() => void evaluateAlerts().catch(() => {}), 5000)
    return () => clearInterval(timer)
  }, 'market-watch: alert engine')

  // ---------- Remote 数据组装(T11:供浏览器侧经 Remote 网关消费) ----------

  const getSettingsView = (): {
    intervalMs: number
    riseColor: 'red' | 'green'
    privacy: { exposeAmounts: boolean }
    sortMode: 'default' | 'asc' | 'desc'
  } =>
    (domain?.global.get() ?? {
      intervalMs: 5000,
      riseColor: 'red' as const,
      privacy: { exposeAmounts: false },
      sortMode: 'default' as const,
    }) as {
      intervalMs: number
      riseColor: 'red' | 'green'
      privacy: { exposeAmounts: boolean }
      sortMode: 'default' | 'asc' | 'desc'
    }

  /** 汇率缓存(T23:5 分钟,失败降级用上次值/无汇率)。 */
  let fxCache: { rates: { USD: number; HKD: number }; at: number } | null = null
  async function getFxRates(): Promise<{ USD: number; HKD: number } | null> {
    const now = Date.now()
    if (fxCache && now - fxCache.at < 5 * 60_000) return fxCache.rates
    try {
      const rates = await fetchFxRates()
      fxCache = { rates, at: now }
      return rates
    } catch {
      return fxCache?.rates ?? null // 失败降级:用旧值或无
    }
  }

  async function computeHoldingsView(): Promise<unknown> {
    if (!domain) return { items: [] }
    const settings = domain.global.get()
    const expose = settings.privacy.exposeAmounts
    const entries = Array.from(domain.table('holdings').entries())
    const symbols = entries.map(([s]) => s as never)
    const quotes = symbols.length ? await getQuotes(symbols) : []
    const quoteBySymbol = new Map(quotes.map((q) => [q.symbol, q]))
    const needFx = quotes.some((q) => q.currency && q.currency !== 'CNY')
    const rates = needFx ? await getFxRates() : null
    return {
      items: entries.map(([symbol, h]) => {
        const quote = quoteBySymbol.get(symbol as never)
        const hasPrice = (quote?.price ?? 0) > 0
        const r = evaluatePosition(
          { shares: h.shares ?? 0, costPrice: h.costPrice ?? h.costNav ?? 0, closed: h.closed },
          { price: quote?.price ?? 0, prevClose: quote?.prevClose ?? 0 },
          prevResults.get(symbol as never),
        )
        if (hasPrice) prevResults.set(symbol as never, r)
        const currency = quote?.currency ?? 'CNY'
        const rate = currency !== 'CNY' ? (rates?.[currency] ?? null) : null
        // FR-WL-06:外币持仓折算人民币(rate 缺失时降级为原币值并标注)
        const toCny = (v: number) => (rate !== null ? v * rate : v)
        const base = { symbol, name: quote?.name, profitRate: r.profitRate, isClosed: r.isClosed }
        if (!expose) return base
        return {
          ...base,
          currency,
          fxRate: rate ?? undefined,
          shares: h.shares,
          amount: h.amount,
          costPrice: h.costPrice,
          costNav: h.costNav,
          dayProfit: toCny(r.dayProfit),
          cumProfit: toCny(r.cumProfit),
          marketValue: toCny(r.marketValue),
        }
      }),
    }
  }

  async function getWatchlistWithQuotes(): Promise<unknown> {
    if (!domain) return { items: [], groups: [], sortMode: 'default' }
    const settings = domain.global.get()
    const entries = Array.from(domain.table('watchlist').entries())
    const symbols = entries.map(([s]) => s as never)
    const quotes = symbols.length ? await getQuotes(symbols) : []
    const quoteBySymbol = new Map(quotes.map((q) => [q.symbol, q]))
    const items = sortWatchItems(
      entries.map(([symbol, v]) => {
        const q = quoteBySymbol.get(symbol as never)
        return {
          symbol: v.symbol,
          name: v.name,
          groupId: v.groupId,
          pinned: v.pinned,
          order: v.order,
          price: q?.price ?? 0,
          changePercent: q?.changePercent ?? 0,
          asOf: q?.time ?? '',
          stale: q === undefined || q.stale === true,
          status: q?.status ?? 'unknown',
          isFund: parseSymbol(v.symbol as never).market === 'fund', // UI 标「估值(延迟约2分钟)」
        }
      }),
      settings.sortMode,
    )
    // 内置组(id 顺序即显示顺序)+ 自定义组(groups 表按 order)
    const custom = Array.from(domain.table('groups').entries())
      .sort((a, b) => a[1].order - b[1].order)
      .map(([id, v]) => ({ id, name: v.name }))
    const groups = [...BUILTIN_GROUPS.map((g) => ({ id: g.id, name: g.name })), ...custom]
    return {
      items,
      groups,
      sortMode: settings.sortMode,
      riseColor: settings.riseColor,
      settings,
    }
  }

  async function setPinnedCore(symbolRaw: string, pinned: boolean): Promise<{ ok: boolean; symbol: string }> {
    if (!domain) return { ok: false, symbol: symbolRaw }
    const symbolId = normalizeSymbol(symbolRaw)
    const rec = domain.table('watchlist').get(symbolId)
    if (rec) await domain.table('watchlist').update(symbolId, (r) => ({ ...r, pinned }))
    return { ok: true, symbol: symbolId }
  }

  async function moveToGroupCore(symbolRaw: string, groupId: string): Promise<{ ok: boolean; symbol: string }> {
    if (!domain) return { ok: false, symbol: symbolRaw }
    const symbolId = normalizeSymbol(symbolRaw)
    const rec = domain.table('watchlist').get(symbolId)
    if (rec) await domain.table('watchlist').update(symbolId, (r) => ({ ...r, groupId }))
    return { ok: true, symbol: symbolId }
  }

  /** 统一的 global 部分更新(运行时 zod schema 校验兜底)。 */
  async function setGlobal(patch: Record<string, unknown>): Promise<boolean> {
    if (!domain) return false
    const cur = domain.global.get()
    await (domain.global.set as (v: unknown) => Promise<unknown>)({ ...cur, ...patch })
    return true
  }

  async function setSortModeCore(mode: 'default' | 'asc' | 'desc'): Promise<{ ok: boolean; symbol: string }> {
    return { ok: await setGlobal({ sortMode: mode }), symbol: '' }
  }

  async function createGroupCore(name: string): Promise<{ ok: boolean; symbol: string }> {
    if (!domain) return { ok: false, symbol: name }
    const id = `custom:${name}`
    const existing = domain.table('groups').get(id)
    if (!existing) {
      const order = Array.from(domain.table('groups').entries()).length
      await domain.table('groups').put(id, { name, order })
    }
    return { ok: true, symbol: id }
  }

  async function updateSettingsCore(patch: Record<string, unknown>): Promise<{ ok: boolean; symbol: string }> {
    return { ok: await setGlobal(patch), symbol: '' }
  }

  async function deleteGroupCore(groupId: string): Promise<{ ok: boolean; symbol: string }> {
    if (!domain) return { ok: false, symbol: groupId }
    await domain.table('groups').delete(groupId as never)
    // 组内标的回退到兜底组(FR-WL-03:一个标的属于一个分组)
    const entries = Array.from(domain.table('watchlist').entries())
    for (const [key, rec] of entries) {
      if (rec.groupId === groupId) {
        await domain.table('watchlist').update(key as never, (r) => ({ ...r, groupId: 'builtin:other' }))
      }
    }
    return { ok: true, symbol: groupId }
  }

  // ---------- 自选增删核心(T14:工具与 Remote 共用) ----------

  async function addToWatchlistCore(
    symbolRaw: string,
    name?: string,
  ): Promise<{ ok: boolean; symbol: string; added: boolean }> {
    if (!domain) return { ok: false, symbol: symbolRaw, added: false }
    const symbolId = normalizeSymbol(symbolRaw)
    const existing = domain.table('watchlist').get(symbolId)
    if (existing) return { ok: true, symbol: symbolId, added: false }
    await domain.table('watchlist').put(symbolId, {
      symbol: symbolId,
      name: name ?? symbolRaw,
      groupId: defaultGroup(symbolId),
      pinned: false,
      order: 0,
      addedAt: new Date().toISOString(),
    })
    return { ok: true, symbol: symbolId, added: true }
  }

  async function removeFromWatchlistCore(
    symbolRaw: string,
  ): Promise<{ ok: boolean; symbol: string }> {
    if (!domain) return { ok: false, symbol: symbolRaw }
    const symbolId = normalizeSymbol(symbolRaw)
    await domain.table('watchlist').delete(symbolId)
    return { ok: true, symbol: symbolId }
  }

  const dataAccess: MarketWatchDataAccess = {
    getWatchlistWithQuotes,
    getHoldingsView: computeHoldingsView,
    getSettingsView,
    searchSymbols: async (query) => ({ items: await searchSymbols(query) }),
    addToWatchlist: (symbol, name) => addToWatchlistCore(symbol, name),
    removeFromWatchlist: (symbol) => removeFromWatchlistCore(symbol),
    setPinned: (symbol, pinned) => setPinnedCore(symbol, pinned),
    moveToGroup: (symbol, groupId) => moveToGroupCore(symbol, groupId),
    setSortMode: (mode) => setSortModeCore(mode),
    createGroup: (name) => createGroupCore(name),
    deleteGroup: (groupId) => deleteGroupCore(groupId),
    updateSettings: (patch) => updateSettingsCore(patch),
  }
  new MarketWatchRuntime(ctx, dataAccess)
  ctx.effect(() => {
    // ctx.typert 的静态类型是 consumer 契约(TypertRegistryContract);
    // 宿主作为贡献方按运行时具体类 TypertRegistry 注册。
    const dispose = (ctx.typert as TypertRegistry).register(TYPERT_MANIFEST)
    return () => {
      void dispose()
    }
  }, 'market-watch: typert manifest')

  ctx.tools.register(
    defineTool({
      name: 'market_watch_hello',
      description: 'market-watch 插件自检:验证宿主侧可用性。数据来自公开接口,不构成投资建议。',
      parameters: {},
      output: textOutput,
      async execute() {
        return 'hello from market-watch'
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'market_quote',
      description:
        '查询 A 股/港股行情,返回现价、涨跌额、涨跌幅等。数据来自公开网页接口,可能延迟,不构成投资建议。',
      parameters: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          required: true,
          description: '标的代码列表,如 sh600519、sz000001',
        },
      },
      output: jsonOutput,
      async execute(args: { symbols: string[] }) {
        const symbols = args.symbols.map((s) => normalizeSymbol(s))
        const quotes = await getQuotes(symbols)
        return toJson(
          quotes.map((q) => ({
            symbol: q.symbol,
            name: q.name,
            price: q.price,
            change: q.change,
            changePercent: q.changePercent,
            asOf: q.time,
            delayed: (q.delayedSec ?? 0) > 0 || q.stale === true,
            source: q.source,
            stale: q.stale ?? false,
          })),
        )
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'market_fund_estimate',
      description:
        '查询基金盘中估值(估算净值、估算涨幅)。数据来自公开网页接口,可能延迟约2分钟,不构成投资建议。',
      parameters: {
        codes: {
          type: 'array',
          items: { type: 'string' },
          required: true,
          description: '基金代码列表,如 110022',
        },
      },
      output: jsonOutput,
      async execute(args: { codes: string[] }) {
        const estimates = await fetchFundEstimates(args.codes)
        return toJson(
          estimates.map((e) => ({
            code: e.code,
            name: e.name,
            navDate: e.navDate,
            nav: e.nav,
            estimateNav: e.estimateNav,
            estimatePercent: e.estimatePercent,
            estimateTime: e.estimateTime,
            isEstimate: e.isEstimate,
            asOf: e.estimateTime ?? e.navDate,
            delayed: true,
            source: e.source,
          })),
        )
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'market_search',
      description:
        '按名称或代码搜索标的(股票/场内基金/指数/场外基金),返回候选列表。数据来自公开接口,不构成投资建议。',
      parameters: {
        query: {
          type: 'string',
          required: true,
          description: '名称或代码关键词,如「茅台」「腾讯」「110022」',
        },
      },
      output: jsonOutput,
      async execute(args: { query: string }) {
        const items = await searchSymbols(args.query)
        return toJson({ items })
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'watchlist_add',
      description: '添加标的到自选(幂等)。数据来自公开接口,不构成投资建议。',
      parameters: {
        symbol: { type: 'string', required: true, description: '标的代码,如 sh600519、110022' },
        name: { type: 'string', description: '标的名称(可选)' },
        group: { type: 'string', description: '分组 id(可选,默认按市场归类)' },
      },
      output: jsonOutput,
      async execute(args: { symbol: string; name?: string; group?: string }) {
        if (!domain) return toJson({ error: 'storage not ready' })
        const r = await addToWatchlistCore(args.symbol, args.name)
        if (r.added && args.group) await moveToGroupCore(r.symbol, args.group) // group 参数:添加后归组
        return toJson({ symbol: r.symbol, added: r.added })
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'watchlist_list',
      description: '列出自选标的。数据来自公开接口,不构成投资建议。',
      parameters: {
        group: { type: 'string', description: '按分组过滤(可选)' },
      },
      output: jsonOutput,
      async execute(args: { group?: string }) {
        if (!domain) return []
        const entries = Array.from(domain.table('watchlist').entries())
        return entries
          .map(([, v]) => v)
          .filter((v) => !args.group || v.groupId === args.group)
          .sort((a, b) => a.order - b.order)
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'watchlist_remove',
      description: '从自选删除标的。数据来自公开接口,不构成投资建议。',
      parameters: {
        symbol: { type: 'string', required: true, description: '标的代码' },
      },
      output: jsonOutput,
      async execute(args: { symbol: string }) {
        if (!domain) return toJson({ error: 'storage not ready' })
        const r = await removeFromWatchlistCore(args.symbol)
        return toJson({ symbol: r.symbol, removed: r.ok })
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'alert_set',
      description:
        '设置涨跌提醒规则(价格或涨跌幅上穿/下穿阈值,3 分钟节流,仅开市评估)。数据来自公开接口,不构成投资建议。',
      parameters: {
        symbol: { type: 'string', required: true, description: '标的代码' },
        kind: { type: 'string', required: true, description: 'price 或 changePercent' },
        direction: { type: 'string', required: true, description: 'up(上穿)或 down(下穿)' },
        threshold: { type: 'number', required: true, description: '阈值' },
      },
      output: jsonOutput,
      async execute(args: {
        symbol: string
        kind: 'price' | 'changePercent'
        direction: 'up' | 'down'
        threshold: number
      }) {
        if (!domain) return toJson({ error: 'storage not ready' })
        const symbolId = normalizeSymbol(args.symbol)
        const id = `${symbolId}|${args.kind}|${args.direction}`
        await domain.table('alerts').put(id, {
          symbol: symbolId,
          kind: args.kind,
          direction: args.direction,
          threshold: args.threshold,
          enabled: true,
          createdAt: new Date().toISOString(),
        })
        return toJson({ id, saved: true })
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'alert_list',
      description: '列出全部提醒规则(含最近触发信息)。数据来自公开接口,不构成投资建议。',
      parameters: {},
      output: jsonOutput,
      async execute() {
        if (!domain) return []
        return Array.from(domain.table('alerts').entries()).map(([id, r]) => ({ id, ...r }))
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'alert_delete',
      description: '删除提醒规则。数据来自公开接口,不构成投资建议。',
      parameters: {
        id: { type: 'string', required: true, description: '规则 id(alert_list 返回)' },
      },
      output: jsonOutput,
      async execute(args: { id: string }) {
        if (!domain) return toJson({ error: 'storage not ready' })
        await domain.table('alerts').delete(args.id as never)
        return toJson({ id: args.id, deleted: true })
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'brief_generate',
      description:
        '生成盘前/盘后简报的结构化数据(休市日返回 closed=true 与「休市」)。由模型整理成文,不构成投资建议。',
      parameters: {
        kind: { type: 'string', required: true, description: 'pre_open(盘前)或 post_close(盘后)' },
      },
      output: jsonOutput,
      async execute(args: { kind: string }) {
        if (!domain) return toJson({ error: 'storage not ready' })
        const kind = args.kind === 'pre_open' ? 'pre_open' : 'post_close'
        const now = new Date()
        // 休市日简报(FR-BRIEF/M3 验收):按 A 股交易日历判定
        if (!isTradingDay('cn_sh', now)) {
          return toJson({ kind, closed: true, message: '今日休市', tradingDay: false, items: [] })
        }
        const entries = Array.from(domain.table('watchlist').entries())
        if (entries.length === 0) {
          return toJson({ kind, closed: false, tradingDay: true, message: '无自选标的', items: [] })
        }
        const symbols = entries.map(([s]) => s as never)
        const quotes = await getQuotes(symbols)
        const items = quotes
          .map((q) => ({
            symbol: q.symbol,
            name: q.name,
            price: q.price,
            changePercent: q.changePercent,
            currency: q.currency,
            status: q.status,
          }))
          .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
        const result: Record<string, unknown> = {
          kind,
          closed: false,
          tradingDay: true,
          generatedAt: now.toISOString(),
          items,
        }
        if (kind === 'post_close') {
          const view = (await computeHoldingsView()) as { items: any[] }
          result.holdings = view.items // 已按隐私过滤;外币已折人民币
        }
        return toJson(result)
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'brief_schedule',
      description:
        '在当前会话创建每日定时简报任务(默认盘前 09:15 / 盘后 15:10,Asia/Shanghai)。触发时由模型调用 brief_generate 整理简报;休市日简报自动返回「休市」。投递绑定创建时的会话(生命周期见 verification.md)。',
      parameters: {
        kind: { type: 'string', required: true, description: 'pre_open 或 post_close' },
        time: { type: 'string', description: 'HH:mm(可选,默认 09:15/15:10)' },
      },
      output: jsonOutput,
      async execute(args: { kind: string; time?: string }) {
        const kind = args.kind === 'pre_open' ? 'pre_open' : 'post_close'
        const time = `${args.time ?? (kind === 'pre_open' ? '09:15' : '15:10')}:00`
        const prompt =
          kind === 'pre_open'
            ? '现在是盘前,请调用 brief_generate 工具(kind=pre_open)获取简报数据并整理成简洁的盘前简报;若返回 closed=true,告知用户今日休市。'
            : '现在已收盘,请调用 brief_generate 工具(kind=post_close)获取简报数据并整理成简洁的收盘简报(含持仓盈亏);若返回 closed=true,告知用户今日休市。'
        try {
          // ctx.schedule 类型扩展在 dsh-schedule 包(未装 devDep),运行时由 dsh 提供
          const scheduleSvc = (ctx as unknown as {
            schedule: { create: (r: unknown) => Promise<unknown> }
          }).schedule
          const schedule = await scheduleSvc.create({
            title: kind === 'pre_open' ? '盘前简报' : '收盘简报',
            prompt,
            daily: { time, time_zone: 'Asia/Shanghai' },
          })
          return toJson({ created: true, kind, time, schedule })
        } catch (e) {
          return toJson({
            error: `schedule create failed: ${e instanceof Error ? e.message : String(e)}`,
          })
        }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'holdings_set',
      description:
        '设置持仓:基金份额/金额(只有金额时按成本净值反推份额)、股票成本价/数量/是否清仓。数据来自公开接口,不构成投资建议。',
      parameters: {
        symbol: { type: 'string', required: true, description: '标的代码' },
        shares: { type: 'number', description: '份额(基金)/数量(股票)' },
        amount: { type: 'number', description: '金额(基金)' },
        costPrice: { type: 'number', description: '成本价(股票)' },
        costNav: { type: 'number', description: '成本净值(基金)' },
        closed: { type: 'boolean', description: '是否已清仓' },
      },
      output: jsonOutput,
      async execute(args: {
        symbol: string
        shares?: number
        amount?: number
        costPrice?: number
        costNav?: number
        closed?: boolean
      }) {
        if (!domain) return toJson({ error: 'storage not ready' })
        const symbolId = normalizeSymbol(args.symbol)
        const existing = domain.table('holdings').get(symbolId)
        const costNav = args.costNav ?? existing?.costNav
        let shares = args.shares ?? existing?.shares
        // 基金只有金额时,按成本净值反推份额(附录 B)
        const isFund = parseSymbol(symbolId).market === 'fund'
        if (isFund && shares == null && args.amount != null && costNav != null && costNav > 0) {
          shares = sharesFromAmount(args.amount, costNav)
        }
        const rec = {
          shares,
          amount: args.amount ?? existing?.amount,
          costPrice: args.costPrice ?? existing?.costPrice,
          costNav,
          closed: args.closed ?? existing?.closed,
          updatedAt: new Date().toISOString(),
        }
        await domain.table('holdings').put(symbolId, rec)
        return toJson({ symbol: symbolId, saved: true, shares })
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'portfolio_summary',
      description:
        '组合持仓汇总:当日盈亏、累计盈亏、组合总收益率、涨跌分布、最大波动标的(受隐私模式限制)。数据来自公开接口,不构成投资建议。',
      parameters: {},
      output: jsonOutput,
      async execute() {
        if (!domain) return toJson({ error: 'storage not ready' })
        const settings = domain.global.get()
        const expose = settings.privacy.exposeAmounts
        const view = (await computeHoldingsView()) as { items: any[] }
        const open = view.items.filter((i) => !i.isClosed)
        const dayTotal = open.reduce((s, i) => s + (i.dayProfit ?? 0), 0)
        const cumTotal = open.reduce((s, i) => s + (i.cumProfit ?? 0), 0)
        const costTotal = open.reduce((s, i) => s + (i.costPrice ?? i.costNav ?? 0) * (i.shares ?? 0), 0)
        const up = open.filter((i) => i.profitRate > 0).length
        const down = open.filter((i) => i.profitRate < 0).length
        const maxSwing = open
          .slice()
          .sort((a, b) => Math.abs(b.profitRate) - Math.abs(a.profitRate))[0]
        const maxSwingOut = maxSwing
          ? { symbol: maxSwing.symbol, name: maxSwing.name, profitRate: maxSwing.profitRate }
          : null
        if (!expose) {
          return toJson({
            count: open.length,
            distribution: { up, down, flat: open.length - up - down },
            maxSwing: maxSwingOut,
          })
        }
        return toJson({
          count: open.length,
          dayProfit: dayTotal,
          cumProfit: cumTotal,
          totalRate: costTotal > 0 ? ((cumTotal) / costTotal) * 100 : null,
          distribution: { up, down, flat: open.length - up - down },
          maxSwing: maxSwingOut,
        })
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'market_export',
      description: '导出自选/分组/持仓/设置为 JSON(带版本号),可用于备份或迁移(FR-WL-07)。',
      parameters: {},
      output: jsonOutput,
      async execute() {
        if (!domain) return toJson({ error: 'storage not ready' })
        return toJson({
          version: 2,
          exportedAt: new Date().toISOString(),
          watchlist: Array.from(domain.table('watchlist').entries()).map(([k, v]) => ({ key: k, ...v })),
          groups: Array.from(domain.table('groups').entries()).map(([k, v]) => ({ key: k, ...v })),
          holdings: Array.from(domain.table('holdings').entries()).map(([k, v]) => ({ key: k, ...v })),
          settings: domain.global.get(),
        })
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'market_import',
      description:
        '导入 market_export 导出的 JSON(带版本号校验,不匹配的版本明确报错;同 key 覆盖)。FR-WL-07。',
      parameters: {
        json: { type: 'string', required: true, description: '导出的 JSON 字符串' },
      },
      output: jsonOutput,
      async execute(args: { json: string }) {
        if (!domain) return toJson({ error: 'storage not ready' })
        let parsed: {
          version?: number
          watchlist?: Array<{ key: string; symbol: string; name: string; groupId: string; pinned: boolean; order: number; addedAt: string }>
          groups?: Array<{ key: string; name: string; order: number }>
          holdings?: Array<Record<string, unknown> & { key: string; updatedAt: string }>
          settings?: Record<string, unknown>
        }
        try {
          parsed = JSON.parse(args.json)
        } catch (e) {
          return toJson({ error: `invalid JSON: ${e instanceof Error ? e.message : String(e)}` })
        }
        if (parsed.version !== 2 && parsed.version !== 1) {
          return toJson({ error: `unsupported export version: ${String(parsed.version)}` })
        }
        let counts = { watchlist: 0, groups: 0, holdings: 0, settings: false }
        for (const it of parsed.watchlist ?? []) {
          if (!it.key) continue
          await domain.table('watchlist').put(it.key as never, {
            symbol: it.symbol,
            name: it.name,
            groupId: it.groupId,
            pinned: it.pinned,
            order: it.order,
            addedAt: it.addedAt,
          })
          counts.watchlist++
        }
        for (const g of parsed.groups ?? []) {
          if (!g.key) continue
          await domain.table('groups').put(g.key as never, { name: g.name, order: g.order })
          counts.groups++
        }
        for (const h of parsed.holdings ?? []) {
          if (!h.key) continue
          const { key, ...rest } = h
          await domain.table('holdings').put(key as never, rest as never)
          counts.holdings++
        }
        if (parsed.settings) {
          await (domain.global.set as (v: unknown) => Promise<unknown>)(parsed.settings)
          counts.settings = true
        }
        return toJson({ imported: counts })
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'holdings_get',
      description:
        '查询持仓与盈亏(受隐私模式限制,默认只返回百分比)。数据来自公开接口,不构成投资建议。',
      parameters: {},
      output: jsonOutput,
      async execute() {
        return toJson(await computeHoldingsView())
      },
    }),
  )
}

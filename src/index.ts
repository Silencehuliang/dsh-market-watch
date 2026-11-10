import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { QuoteService } from './core/quote-service.js'
import { fetchSinaStocks } from './core/providers/sina.js'
import { fetchFundEstimates } from './core/providers/eastmoney.js'
import { normalizeSymbol, parseSymbol } from './core/symbol.js'
import { marketStatus } from './core/calendar.js'
import { searchSymbols } from './core/search.js'
// 轮询/UI 刷新用 isMarketOpenNow 判断(FR-DATA-07:节假日不发起高频轮询)
import { evaluatePosition, sharesFromAmount } from './core/portfolio.js'
import { sortWatchItems } from './core/watchlist-sort.js'
import type { PositionResult } from './core/portfolio.js'
import type { Quote, SymbolId } from './core/types.js'
import { MarketWatchRuntime } from './remote/runtime.js'
import type { MarketWatchDataAccess } from './remote/runtime.js'
import { TYPERT_MANIFEST } from './remote/typert.js'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'

export const name = 'market-watch'
export const inject = ['tools', 'storageDomain', 'typert']

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
  },
  global: {
    schema: z.object({
      intervalMs: z.number(),
      riseColor: z.enum(['red', 'green']),
      privacy: z.object({ exposeAmounts: z.boolean() }),
      // default 保证 v1 存量 global(无 sortMode)通过 v2 校验(FR-CFG-03)
      sortMode: z.enum(['default', 'asc', 'desc']).default('default'),
    }),
    initial: {
      intervalMs: 5000,
      riseColor: 'red',
      privacy: { exposeAmounts: false },
      sortMode: 'default' as const,
    },
  },
})

function defaultGroup(symbolId: string): string {
  const { market } = parseSymbol(symbolId as never)
  if (market === 'cn_sh' || market === 'cn_sz' || market === 'cn_bj') return 'builtin:a_stock'
  if (market === 'hk') return 'builtin:hk'
  if (market === 'us') return 'builtin:us'
  if (market === 'fund') return 'builtin:fund'
  return 'builtin:other'
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

  /** 按 market 路由:股票走 sina,基金走东财。 */
  async function getQuotes(symbols: SymbolId[]): Promise<Quote[]> {
    const stocks = symbols.filter((s) => parseSymbol(s).market !== 'fund')
    const funds = symbols.filter((s) => parseSymbol(s).market === 'fund')
    const [stockRes, fundRes] = await Promise.allSettled([
      stocks.length ? stockQuotes.getQuotes(stocks) : Promise.resolve([] as Quote[]),
      funds.length ? fundQuotes.getQuotes(funds) : Promise.resolve([] as Quote[]),
    ])
    const out: Quote[] = []
    if (stockRes.status === 'fulfilled') out.push(...stockRes.value)
    if (fundRes.status === 'fulfilled') out.push(...fundRes.value)
    // 由交易日历填充 status(FR-DATA-07):open/closed/pre/post
    const now = new Date()
    return out.map((q) => ({ ...q, status: marketStatus(parseSymbol(q.symbol).market, now) }))
  }

  /** 收盘保持:上次盈亏结果缓存(price≤0 时 evaluatePosition 保持它)。 */
  const prevResults = new Map<SymbolId, PositionResult>()

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

  async function computeHoldingsView(): Promise<unknown> {
    if (!domain) return { items: [] }
    const settings = domain.global.get()
    const expose = settings.privacy.exposeAmounts
    const entries = Array.from(domain.table('holdings').entries())
    const symbols = entries.map(([s]) => s as never)
    const quotes = symbols.length ? await getQuotes(symbols) : []
    const quoteBySymbol = new Map(quotes.map((q) => [q.symbol, q]))
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
        const base = { symbol, name: quote?.name, profitRate: r.profitRate, isClosed: r.isClosed }
        if (!expose) return base
        return {
          ...base,
          shares: h.shares,
          amount: h.amount,
          costPrice: h.costPrice,
          costNav: h.costNav,
          dayProfit: r.dayProfit,
          cumProfit: r.cumProfit,
          marketValue: r.marketValue,
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
        }
      }),
      settings.sortMode,
    )
    // 内置组(id 顺序即显示顺序)+ 自定义组(groups 表按 order)
    const custom = Array.from(domain.table('groups').entries())
      .sort((a, b) => a[1].order - b[1].order)
      .map(([id, v]) => ({ id, name: v.name }))
    const groups = [
      { id: 'builtin:a_stock', name: 'A股' },
      { id: 'builtin:hk', name: '港股' },
      { id: 'builtin:us', name: '美股' },
      { id: 'builtin:fund', name: '基金' },
      { id: 'builtin:other', name: '其他' },
      ...custom,
    ]
    return { items, groups, sortMode: settings.sortMode }
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

  async function setSortModeCore(mode: 'default' | 'asc' | 'desc'): Promise<{ ok: boolean; symbol: string }> {
    if (!domain) return { ok: false, symbol: '' }
    const cur = domain.global.get()
    // zod .default() 使 get 的推断类型复杂化;运行时 set 有 schema 校验兜底
    await (domain.global.set as (v: unknown) => Promise<unknown>)({ ...cur, sortMode: mode })
    return { ok: true, symbol: '' }
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

  // ---------- 自选增删核心(T14:工具与 Remote 共用) ----------

  async function addToWatchlistCore(
    symbolRaw: string,
    name?: string,
  ): Promise<{ ok: boolean; symbol: string }> {
    if (!domain) return { ok: false, symbol: symbolRaw }
    const symbolId = normalizeSymbol(symbolRaw)
    const existing = domain.table('watchlist').get(symbolId)
    if (!existing) {
      await domain.table('watchlist').put(symbolId, {
        symbol: symbolId,
        name: name ?? symbolRaw,
        groupId: defaultGroup(symbolId),
        pinned: false,
        order: 0,
        addedAt: new Date().toISOString(),
      })
    }
    return { ok: true, symbol: symbolId }
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
        const symbolId = normalizeSymbol(args.symbol)
        const existing = domain.table('watchlist').get(symbolId)
        if (existing) return toJson({ symbol: symbolId, added: false })
        const rec = {
          symbol: symbolId,
          name: args.name ?? args.symbol,
          groupId: args.group ?? defaultGroup(symbolId),
          pinned: false,
          order: 0,
          addedAt: new Date().toISOString(),
        }
        await domain.table('watchlist').put(symbolId, rec)
        return toJson({ symbol: symbolId, added: true })
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
        const symbolId = normalizeSymbol(args.symbol)
        await domain.table('watchlist').delete(symbolId)
        return toJson({ symbol: symbolId, removed: true })
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

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { QuoteService } from './core/quote-service.js'
import { fetchSinaStocks } from './core/providers/sina.js'
import { fetchFundEstimates } from './core/providers/eastmoney.js'
import { normalizeSymbol, parseSymbol } from './core/symbol.js'

export const name = 'market-watch'
export const inject = ['tools', 'storageDomain']

const marketWatchSpec = defineDomain({
  name: 'market_watch',
  version: 1,
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
  },
  global: {
    schema: z.object({
      intervalMs: z.number(),
      riseColor: z.enum(['red', 'green']),
    }),
    initial: { intervalMs: 5000, riseColor: 'red' },
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

export function apply(ctx: Context) {
  let domain: Domain<typeof marketWatchSpec> | undefined

  void ctx.storageDomain.open(marketWatchSpec).then((d) => {
    domain = d
    ctx.effect(() => () => {
      void d.close()
    })
  })

  const quoteService = new QuoteService(fetchSinaStocks)

  ctx.tools.register(
    defineTool({
      name: 'market_watch_hello',
      description: 'market-watch 自检:验证 storage 读写。数据来自公开接口,不构成投资建议。',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args: unknown, value: string) => [{ type: 'text', text: value }],
      },
      async execute() {
        if (!domain) return 'storage not ready'
        await domain.table('watchlist').put('fund:110022', {
          symbol: 'fund:110022',
          name: '示例基金',
          groupId: 'builtin:fund',
          pinned: false,
          order: 0,
          addedAt: new Date().toISOString(),
        })
        const rec = domain.table('watchlist').get('fund:110022')
        const settings = domain.global.get()
        return `hello from market-watch; storage ok: ${rec?.name}, intervalMs=${settings.intervalMs}`
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'market_quote',
      description:
        '查询 A 股行情,返回现价、涨跌额、涨跌幅等。数据来自公开网页接口,可能延迟,不构成投资建议。',
      parameters: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          required: true,
          description: '标的代码列表,如 sh600519、sz000001',
        },
      },
      output: {
        schema: { type: 'json' },
        render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      async execute(args: { symbols: string[] }) {
        const symbols = args.symbols.map((s) => normalizeSymbol(s))
        const quotes = await quoteService.getQuotes(symbols)
        return quotes.map((q) => ({
          symbol: q.symbol,
          name: q.name,
          price: q.price,
          change: q.change,
          changePercent: q.changePercent,
          time: q.time,
          source: q.source,
          stale: q.stale ?? false,
        }))
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
      output: {
        schema: { type: 'json' },
        render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      async execute(args: { codes: string[] }) {
        const estimates = await fetchFundEstimates(args.codes)
        const result = estimates.map((e) => ({
          code: e.code,
          name: e.name,
          navDate: e.navDate,
          nav: e.nav,
          estimateNav: e.estimateNav,
          estimatePercent: e.estimatePercent,
          estimateTime: e.estimateTime,
          isEstimate: e.isEstimate,
          source: e.source,
        }))
        // 去除 undefined 字段(JsonValue 不允许 undefined)
        return JSON.parse(JSON.stringify(result))
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
      output: {
        schema: { type: 'json' },
        render: (_a: unknown, v: unknown) => [{ type: 'text', text: JSON.stringify(v) }],
      },
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
      output: {
        schema: { type: 'json' },
        render: (_a: unknown, v: unknown) => [{ type: 'text', text: JSON.stringify(v) }],
      },
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
      output: {
        schema: { type: 'json' },
        render: (_a: unknown, v: unknown) => [{ type: 'text', text: JSON.stringify(v) }],
      },
      async execute(args: { symbol: string }) {
        if (!domain) return toJson({ error: 'storage not ready' })
        const symbolId = normalizeSymbol(args.symbol)
        await domain.table('watchlist').delete(symbolId)
        return toJson({ symbol: symbolId, removed: true })
      },
    }),
  )
}

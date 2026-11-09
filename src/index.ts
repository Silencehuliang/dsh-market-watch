import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { QuoteService } from './core/quote-service.js'
import { fetchSinaStocks } from './core/providers/sina.js'
import { normalizeSymbol } from './core/symbol.js'

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
}

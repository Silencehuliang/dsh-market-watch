/**
 * market-watch Remote 契约:宿主与浏览器共享的 zod schema 与 invocation 描述。
 * 契约漂移防线:host/client 共用同一份描述符列表(对齐官方 dsh-plugin-template)。
 */
import { z } from 'zod'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'

const PKG = 'dsh-plugin-market-watch'

// ---------- schema ----------

export const watchlistItemSchema = z
  .object({
    symbol: z.string(),
    name: z.string(),
    groupId: z.string(),
    pinned: z.boolean(),
    order: z.number(),
    price: z.number(),
    changePercent: z.number(),
    asOf: z.string(),
    stale: z.boolean(),
  })
  .readonly()

export const watchlistResultSchema = z.object({ items: z.array(watchlistItemSchema) }).readonly()

export const holdingsItemSchema = z
  .object({
    symbol: z.string(),
    name: z.string().optional(),
    profitRate: z.number(),
    isClosed: z.boolean(),
    shares: z.number().optional(),
    amount: z.number().optional(),
    costPrice: z.number().optional(),
    costNav: z.number().optional(),
    dayProfit: z.number().optional(),
    cumProfit: z.number().optional(),
    marketValue: z.number().optional(),
  })
  .readonly()

export const holdingsResultSchema = z.object({ items: z.array(holdingsItemSchema) }).readonly()

export const settingsSchema = z
  .object({
    intervalMs: z.number(),
    riseColor: z.enum(['red', 'green']),
    privacy: z.object({ exposeAmounts: z.boolean() }).readonly(),
  })
  .readonly()

export const settingsResultSchema = z.object({ settings: settingsSchema }).readonly()

export type WatchlistResult = z.infer<typeof watchlistResultSchema>
export type HoldingsResult = z.infer<typeof holdingsResultSchema>
export type SettingsResult = z.infer<typeof settingsResultSchema>

// ---------- codec helpers(本地辅助,对齐官方模板)----------

const json = (name: string, wire: string, typeSymbol: string, schema: z.ZodType) => ({
  name,
  wire,
  source: 'json' as const,
  codec: { mode: 'strict' as const, typeSymbol, create: () => schema },
})

const resultOf = (typeSymbol: string, schema: z.ZodType) => ({
  mode: 'strict' as const,
  typeSymbol,
  create: () => schema,
})

// ---------- invocations ----------

export const MARKET_WATCH_INVOCATIONS: readonly InvocationDescriptor[] = [
  {
    id: `${PKG}#market-watch/getWatchlist`,
    service: 'market-watch',
    namespace: 'market-watch',
    method: 'getWatchlist',
    invocation: { kind: 'direct' },
    parameters: [],
    result: resultOf(`${PKG}#WatchlistResult`, watchlistResultSchema),
  },
  {
    id: `${PKG}#market-watch/getHoldings`,
    service: 'market-watch',
    namespace: 'market-watch',
    method: 'getHoldings',
    invocation: { kind: 'direct' },
    parameters: [],
    result: resultOf(`${PKG}#HoldingsResult`, holdingsResultSchema),
  },
  {
    id: `${PKG}#market-watch/getSettings`,
    service: 'market-watch',
    namespace: 'market-watch',
    method: 'getSettings',
    invocation: { kind: 'direct' },
    parameters: [],
    result: resultOf(`${PKG}#SettingsResult`, settingsResultSchema),
  },
]

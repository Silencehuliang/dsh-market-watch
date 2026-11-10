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
    status: z.enum(['open', 'closed', 'pre', 'post', 'halt', 'unknown']),
    isFund: z.boolean(),
    currency: z.enum(['USD', 'HKD', 'CNY']).optional(),
  })
  .readonly()

export const settingsSchema = z
  .object({
    intervalMs: z.number(),
    riseColor: z.enum(['red', 'green']),
    privacy: z.object({ exposeAmounts: z.boolean() }).readonly(),
    sortMode: z.enum(['default', 'asc', 'desc']),
    alertsEnabled: z.boolean(),
    miniBarSymbols: z.array(z.string()).readonly(),
  })
  .readonly()

export const settingsResultSchema = z.object({ settings: settingsSchema }).readonly()

export const klineResultSchema = z
  .object({
    symbol: z.string(),
    bars: z
      .array(
        z.object({
          date: z.string(),
          open: z.number(),
          close: z.number(),
          high: z.number(),
          low: z.number(),
          volume: z.number(),
        }),
      )
      .readonly(),
  })
  .readonly()

export const fundHistoryResultSchema = z
  .object({
    code: z.string(),
    list: z
      .array(
        z.object({
          date: z.string(),
          nav: z.number(),
          accNav: z.number(),
          changePercent: z.number(),
        }),
      )
      .readonly(),
  })
  .readonly()

export const watchlistResultSchema = z
  .object({
    items: z.array(watchlistItemSchema),
    groups: z
      .array(z.object({ id: z.string(), name: z.string() }))
      .readonly(),
    sortMode: z.enum(['default', 'asc', 'desc']),
    riseColor: z.enum(['red', 'green']),
    settings: settingsSchema,
  })
  .readonly()

export const holdingsItemSchema = z
  .object({
    symbol: z.string(),
    name: z.string().optional(),
    profitRate: z.number(),
    isClosed: z.boolean(),
    /** 计价币种(外币持仓;CNY 市场省略)。#33 修复:此前被 schema 剥离,UI 永远看不到。 */
    currency: z.enum(['USD', 'HKD', 'CNY']).optional(),
    /** 汇率(仅 exposeAmounts 时随金额下发)。 */
    fxRate: z.number().optional(),
    /** 汇率缺失降级标注:金额未折算(两种模式都可见,百分比不受影响)。 */
    fxMissing: z.boolean().optional(),
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

export type WatchlistResult = z.infer<typeof watchlistResultSchema>
export type HoldingsResult = z.infer<typeof holdingsResultSchema>
export type SettingsResult = z.infer<typeof settingsResultSchema>

export const searchResultSchema = z
  .object({
    items: z
      .array(
        z.object({
          symbol: z.string(),
          name: z.string(),
          market: z.string(),
          type: z.string(),
        }),
      )
      .readonly(),
  })
  .readonly()

export const opResultSchema = z.object({ ok: z.boolean(), symbol: z.string() }).readonly()

export type SearchResult = z.infer<typeof searchResultSchema>
export type OpResult = z.infer<typeof opResultSchema>

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
  {
    id: `${PKG}#market-watch/search`,
    service: 'market-watch',
    namespace: 'market-watch',
    method: 'search',
    invocation: { kind: 'direct' },
    parameters: [json('query', 'query', `${PKG}#SearchQuery`, z.string())],
    cancellation: { parameter: 'signal' },
    result: resultOf(`${PKG}#SearchResult`, searchResultSchema),
  },
  {
    id: `${PKG}#market-watch/addToWatchlist`,
    service: 'market-watch',
    namespace: 'market-watch',
    method: 'addToWatchlist',
    invocation: { kind: 'direct' },
    parameters: [
      json('symbol', 'symbol', `${PKG}#AddSymbol`, z.string()),
      json('name', 'name', `${PKG}#AddName`, z.string().optional()),
    ],
    cancellation: { parameter: 'signal' },
    result: resultOf(`${PKG}#OpResult`, opResultSchema),
  },
  {
    id: `${PKG}#market-watch/removeFromWatchlist`,
    service: 'market-watch',
    namespace: 'market-watch',
    method: 'removeFromWatchlist',
    invocation: { kind: 'direct' },
    parameters: [json('symbol', 'symbol', `${PKG}#RemoveSymbol`, z.string())],
    cancellation: { parameter: 'signal' },
    result: resultOf(`${PKG}#OpResult`, opResultSchema),
  },
  {
    id: `${PKG}#market-watch/setPinned`,
    service: 'market-watch',
    namespace: 'market-watch',
    method: 'setPinned',
    invocation: { kind: 'direct' },
    parameters: [
      json('symbol', 'symbol', `${PKG}#PinSymbol`, z.string()),
      json('pinned', 'pinned', `${PKG}#PinValue`, z.boolean()),
    ],
    cancellation: { parameter: 'signal' },
    result: resultOf(`${PKG}#OpResult`, opResultSchema),
  },
  {
    id: `${PKG}#market-watch/moveToGroup`,
    service: 'market-watch',
    namespace: 'market-watch',
    method: 'moveToGroup',
    invocation: { kind: 'direct' },
    parameters: [
      json('symbol', 'symbol', `${PKG}#MoveSymbol`, z.string()),
      json('groupId', 'groupId', `${PKG}#MoveGroup`, z.string()),
    ],
    cancellation: { parameter: 'signal' },
    result: resultOf(`${PKG}#OpResult`, opResultSchema),
  },
  {
    id: `${PKG}#market-watch/setSortMode`,
    service: 'market-watch',
    namespace: 'market-watch',
    method: 'setSortMode',
    invocation: { kind: 'direct' },
    parameters: [json('mode', 'mode', `${PKG}#SortModeValue`, z.enum(['default', 'asc', 'desc']))],
    cancellation: { parameter: 'signal' },
    result: resultOf(`${PKG}#OpResult`, opResultSchema),
  },
  {
    id: `${PKG}#market-watch/createGroup`,
    service: 'market-watch',
    namespace: 'market-watch',
    method: 'createGroup',
    invocation: { kind: 'direct' },
    parameters: [json('name', 'name', `${PKG}#GroupName`, z.string())],
    cancellation: { parameter: 'signal' },
    result: resultOf(`${PKG}#OpResult`, opResultSchema),
  },
  {
    id: `${PKG}#market-watch/getKline`,
    service: 'market-watch',
    namespace: 'market-watch',
    method: 'getKline',
    invocation: { kind: 'direct' },
    parameters: [
      json('symbol', 'symbol', `${PKG}#KlineSymbol`, z.string()),
      json('days', 'days', `${PKG}#KlineDays`, z.number()),
    ],
    cancellation: { parameter: 'signal' },
    result: resultOf(`${PKG}#KlineResult`, klineResultSchema),
  },
  {
    id: `${PKG}#market-watch/getFundHistory`,
    service: 'market-watch',
    namespace: 'market-watch',
    method: 'getFundHistory',
    invocation: { kind: 'direct' },
    parameters: [
      json('code', 'code', `${PKG}#FundCode`, z.string()),
      json('days', 'days', `${PKG}#FundDays`, z.number()),
    ],
    cancellation: { parameter: 'signal' },
    result: resultOf(`${PKG}#FundHistoryResult`, fundHistoryResultSchema),
  },
  {
    id: `${PKG}#market-watch/deleteGroup`,
    service: 'market-watch',
    namespace: 'market-watch',
    method: 'deleteGroup',
    invocation: { kind: 'direct' },
    parameters: [json('groupId', 'groupId', `${PKG}#DeleteGroup`, z.string())],
    cancellation: { parameter: 'signal' },
    result: resultOf(`${PKG}#OpResult`, opResultSchema),
  },
  {
    id: `${PKG}#market-watch/updateSettings`,
    service: 'market-watch',
    namespace: 'market-watch',
    method: 'updateSettings',
    invocation: { kind: 'direct' },
    parameters: [
      json('patch', 'patch', `${PKG}#SettingsPatch`, z.record(z.string(), z.unknown())),
    ],
    cancellation: { parameter: 'signal' },
    result: resultOf(`${PKG}#OpResult`, opResultSchema),
  },
  {
    id: `${PKG}#market-watch/ackAlerts`,
    service: 'market-watch',
    namespace: 'market-watch',
    method: 'ackAlerts',
    invocation: { kind: 'direct' },
    parameters: [],
    cancellation: { parameter: 'signal' },
    result: resultOf(`${PKG}#OpResult`, opResultSchema),
  },
]

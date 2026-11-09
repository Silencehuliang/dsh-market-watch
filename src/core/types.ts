import type { Market, SymbolId } from './symbol.js'

export type { Market, SymbolId }

/** 行情报价(股票/期货/外汇)。 */
export interface Quote {
  symbol: SymbolId
  name: string
  price: number
  change: number
  changePercent: number
  open?: number
  high?: number
  low?: number
  prevClose?: number
  volume?: number
  amount?: number
  /** 行情时间,ISO 或 `YYYY-MM-DD HH:mm:ss`。 */
  time: string
  status: 'open' | 'closed' | 'pre' | 'post' | 'halt' | 'unknown'
  /** provider id。 */
  source: string
  delayedSec?: number
  /** 缓存兜底标记:主源失败、返回的是过期缓存。 */
  stale?: boolean
}

/** Provider 统一返回包裹(供工具/UI 消费)。 */
export interface ProviderResult<T> {
  data: T
  source: string
  delayed: boolean
  asOf: string
}

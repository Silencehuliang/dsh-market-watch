import type { Market, SymbolId } from './symbol.js'

/** 行情币种(腾讯美股/港股返回;CNY 市场省略)。 */
export type Currency = 'USD' | 'HKD' | 'CNY'

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
  /** 计价币种(hk→HKD、us→USD;CNY 市场省略,FR-WL-06 汇率折算依赖)。 */
  currency?: Currency
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

/** 搜索候选(FR-WL-02:代码/名称/市场/类型)。 */
export interface SearchResultItem {
  symbol: string
  name: string
  market: string
  /** stock / index / fund / other。 */
  type: string
}

/** 基金盘中估值(不是官方净值)。 */
export interface FundEstimate {
  code: string
  name: string
  /** 最近官方净值日期。 */
  navDate: string
  /** 最近官方单位净值。 */
  nav?: number
  /** 估值净值(盘中;收盘后无)。 */
  estimateNav?: number
  /** 估值涨幅(%)。 */
  estimatePercent?: number
  /** 估值时间。 */
  estimateTime?: string
  /** 界面必须标注「估值(延迟约2分钟)」。 */
  isEstimate: true
  source: string
}

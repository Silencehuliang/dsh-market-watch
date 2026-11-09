/**
 * 盈亏计算(纯函数,零依赖)。公式对齐 leek-fund 源码与附录 B。
 */

/** 份额反推:shares = amount / nav。净值 ≤ 0 时返回 0,避免 Infinity。 */
export function sharesFromAmount(amount: number, nav: number): number {
  return nav > 0 ? amount / nav : 0
}

/** 持仓市值:marketValue = shares × price。 */
export function marketValue(shares: number, price: number): number {
  return shares * price
}

/** 当日盈亏:(现价 − 昨价) × 份额。股票昨价=昨收,基金昨价=昨日净值。 */
export function dayProfit(shares: number, currentPrice: number, prevPrice: number): number {
  return (currentPrice - prevPrice) * shares
}

/** 累计盈亏:(现价 − 成本价) × 份额。 */
export function cumProfit(shares: number, price: number, costPrice: number): number {
  return (price - costPrice) * shares
}

/** 收益率(%):(现价 − 成本价) ÷ 成本价 × 100。成本 ≤ 0 时返回 0。 */
export function profitRate(price: number, costPrice: number): number {
  if (costPrice <= 0) return 0
  return ((price - costPrice) / costPrice) * 100
}

/** 对齐 leek-fund 的 caculateEarnings:盈亏 = (money/price)×currentPrice − money,即份额×(现价−成本)。 */
export function caculateEarnings(money: number, price: number, currentPrice: number): number {
  if (currentPrice <= 0 || price <= 0) return 0
  return (money / price) * currentPrice - money
}

export interface Position {
  shares: number
  costPrice: number
  closed?: boolean
}

export interface QuoteLike {
  /** 现价 / 估值;≤ 0 表示无有效价格(收盘后无新行情)。 */
  price: number
  /** 昨收 / 昨日净值。 */
  prevClose: number
}

export interface PositionResult {
  dayProfit: number
  cumProfit: number
  profitRate: number
  marketValue: number
  isClosed: boolean
}

/** 评估持仓:清仓归零;无有效价格(收盘后)保持上次结果,不归零。 */
export function evaluatePosition(
  position: Position,
  quote: QuoteLike,
  prev?: PositionResult,
): PositionResult {
  if (position.closed) {
    return { dayProfit: 0, cumProfit: 0, profitRate: 0, marketValue: 0, isClosed: true }
  }
  if (quote.price <= 0) {
    if (prev) return prev
    return { dayProfit: 0, cumProfit: 0, profitRate: 0, marketValue: 0, isClosed: false }
  }
  return {
    dayProfit: dayProfit(position.shares, quote.price, quote.prevClose),
    cumProfit: cumProfit(position.shares, quote.price, position.costPrice),
    profitRate: profitRate(quote.price, position.costPrice),
    marketValue: marketValue(position.shares, quote.price),
    isClosed: false,
  }
}

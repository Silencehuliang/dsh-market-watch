import { describe, expect, it } from 'vitest'
import {
  caculateEarnings,
  cumProfit,
  dayProfit,
  evaluatePosition,
  marketValue,
  profitRate,
  sharesFromAmount,
} from '../src/core/portfolio'

describe('sharesFromAmount (TC-PL-01)', () => {
  it('基金金额反推份额:金额 10000 / 昨日净值 1.2 ≈ 8333.33', () => {
    expect(sharesFromAmount(10000, 1.2)).toBeCloseTo(8333.33, 2)
  })
  it('净值为 0 时返回 0,不产生 Infinity', () => {
    expect(sharesFromAmount(10000, 0)).toBe(0)
  })
})

describe('dayProfit (TC-PL-02 / TC-PL-03)', () => {
  it('基金当日盈亏:份额 8333.33 × (估值 1.21 − 昨日 1.2) ≈ 83.33', () => {
    expect(dayProfit(8333.33, 1.21, 1.2)).toBeCloseTo(83.33, 2)
  })
  it('股票当日盈亏:(现价 10.5 − 昨收 10) × 1000 = 500', () => {
    expect(dayProfit(1000, 10.5, 10)).toBe(500)
  })
})

describe('cumProfit (TC-PL-04)', () => {
  it('股票累计盈亏:(现价 11 − 成本 9) × 1000 = 2000', () => {
    expect(cumProfit(1000, 11, 9)).toBe(2000)
  })
})

describe('profitRate (TC-PL-05)', () => {
  it('股票收益率:(11 − 9) / 9 × 100 ≈ 22.22%', () => {
    expect(profitRate(11, 9)).toBeCloseTo(22.22, 2)
  })
  it('成本为 0 时返回 0', () => {
    expect(profitRate(11, 0)).toBe(0)
  })
})

describe('marketValue', () => {
  it('市值 = 份额 × 现价', () => {
    expect(marketValue(1000, 11)).toBe(11000)
  })
})

describe('caculateEarnings (leek-fund 对齐)', () => {
  it('(money/price)×currentPrice − money', () => {
    // 本金 10000,成本净值 1.0,现净值 1.2 → 份额 10000,盈亏 = 10000×1.2 − 10000 = 2000
    expect(caculateEarnings(10000, 1.0, 1.2)).toBeCloseTo(2000)
  })
  it('现价为 0 时返回 0', () => {
    expect(caculateEarnings(10000, 1.0, 0)).toBe(0)
  })
})

describe('evaluatePosition (TC-PL-06 / TC-PL-07)', () => {
  it('TC-PL-06 收盘后无新行情(price<=0)→ 保持上次盈亏不归零', () => {
    const prev = { dayProfit: 500, cumProfit: 2000, profitRate: 22.22, marketValue: 11000, isClosed: false }
    const result = evaluatePosition({ shares: 1000, costPrice: 9 }, { price: 0, prevClose: 10 }, prev)
    expect(result).toEqual(prev)
  })
  it('TC-PL-07 已清仓 → 盈亏归零,标记清仓', () => {
    const result = evaluatePosition({ shares: 1000, costPrice: 9, closed: true }, { price: 11, prevClose: 10 })
    expect(result.cumProfit).toBe(0)
    expect(result.dayProfit).toBe(0)
    expect(result.isClosed).toBe(true)
  })
  it('正常持仓:计算当日/累计/收益率/市值', () => {
    const result = evaluatePosition({ shares: 1000, costPrice: 9 }, { price: 11, prevClose: 10 })
    expect(result.dayProfit).toBeCloseTo(1000)
    expect(result.cumProfit).toBeCloseTo(2000)
    expect(result.profitRate).toBeCloseTo(22.22, 2)
    expect(result.marketValue).toBeCloseTo(11000)
    expect(result.isClosed).toBe(false)
  })
})

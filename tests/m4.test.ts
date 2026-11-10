import { describe, expect, it } from 'vitest'
import { parseHsgDaily } from '../src/core/providers/m4'

/** 2026-11-10 实机响应(真实值)。 */
const KAMT_FIXTURE = {
  data: {
    hk2sh: {
      status: 3, dayNetAmtIn: 0, dayAmtRemain: 0, dayAmtThreshold: 5200000,
      date: '11-10', date2: '2026-11-10', monthNetAmtIn: 5200000, yearNetAmtIn: 5200000,
      allNetAmtIn: 256533462.38, buyAmt: 0, sellAmt: 0, buySellAmt: 9197761.11,
    },
    sh2hk: {
      status: 3, dayNetAmtIn: 4200000, dayAmtRemain: 0, dayAmtThreshold: 4200000,
      date: '11-10', date2: '2026-11-10', monthNetAmtIn: 29400000, yearNetAmtIn: 840000000,
      allNetAmtIn: 2492274339.29, buyAmt: 2376764.26, sellAmt: 2491144.92, buySellAmt: 4867909.19,
    },
    hk2sz: {
      status: 3, dayNetAmtIn: 0, dayAmtRemain: 0, dayAmtThreshold: 5200000,
      date: '11-10', date2: '2026-11-10', monthNetAmtIn: 5200000, yearNetAmtIn: 5200000,
      allNetAmtIn: 237940899.34, buyAmt: 0, sellAmt: 0, buySellAmt: 10635160.37,
    },
    sz2hk: {
      status: 3, dayNetAmtIn: 4200000, dayAmtRemain: 0, dayAmtThreshold: 4200000,
      date: '11-10', date2: '2026-11-10', monthNetAmtIn: 29400000, yearNetAmtIn: 840000000,
      allNetAmtIn: 2434860606.9, buyAmt: 1159481.97, sellAmt: 1319042.99, buySellAmt: 2478524.97,
    },
  },
}

describe('parseHsgDaily(#34:北向口径失效后的南向/北向解析)', () => {
  it('南向:净买入 = 买 − 卖(万元→亿),不信任占位的 dayNetAmtIn', () => {
    const { south } = parseHsgDaily(KAMT_FIXTURE)
    expect(south.date).toBe('2026-11-10')
    // sh2hk 净 = 2376764.26 − 2491144.92 = −114380.66 万;sz2hk 净 = −159561.02 万 → 合计 −27.39 亿
    expect(south.netCny).toBeCloseTo(-27.394168, 4)
    expect(south.buyCny).toBeCloseTo((2376764.26 + 1159481.97) / 1e4, 4)
    expect(south.sellCny).toBeCloseTo((2491144.92 + 1319042.99) / 1e4, 4)
    expect(south.turnoverCny).toBeCloseTo((4867909.19 + 2478524.97) / 1e4, 4)
  })

  it('北向:仅总成交额可用(净买入恒 0 不可用)', () => {
    const { north } = parseHsgDaily(KAMT_FIXTURE)
    expect(north.date).toBe('2026-11-10')
    expect(north.turnoverCny).toBeCloseTo((9197761.11 + 10635160.37) / 1e4, 4)
  })

  it('腿缺失抛错', () => {
    expect(() => parseHsgDaily({ data: {} })).toThrow('hsg legs missing')
    expect(() => parseHsgDaily({})).toThrow('hsg legs missing')
  })
})

import { describe, expect, it } from 'vitest'
import { parseFundRankText, parseHsgDaily, parseNewsFlashText, parseSectorFlow } from '../src/core/providers/m4'

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

describe('parseSectorFlow / parseNewsFlashText / parseFundRankText(#38 拆纯函数)', () => {
  it('板块资金流:f62 元 → 亿', () => {
    const items = parseSectorFlow({ data: { diff: [{ f14: '半导体', f62: 5.6e8, f184: 2.1 }] } })
    expect(items[0]!.name).toBe('半导体')
    expect(items[0]!.netInflow).toBeCloseTo(5.6, 6)
    expect(items[0]!.changePercent).toBe(2.1)
    expect(parseSectorFlow({})).toEqual([])
  })

  it('金十快讯:截取 JSON 数组、缺省字段兜底', () => {
    const text = `var abc={"x":1};var list=[{"id":"1","time":"10:00:00","data":{"title":"央行","content":"逆回购"}},{"id":"2","time":"09:00:00"}];`
    const items = parseNewsFlashText(text, 10)
    expect(items).toHaveLength(2)
    expect(items[0]!.title).toBe('央行')
    expect(items[1]!.title).toBe('')
    expect(items[1]!.content).toBe('')
    expect(parseNewsFlashText(text, 1)).toHaveLength(1)
  })

  it('基金排行:datas 列拆分(0 代码/名称/4 净值/6 日涨幅/11 年涨幅)', () => {
    const text = `var rankData = {datas:["110022,易方达消费行业,2026-11-10,1.0,4.500,4.500,2.20,,,,,30.10"],allRecords:1};`
    const items = parseFundRankText(text)
    expect(items[0]!.code).toBe('110022')
    expect(items[0]!.name).toBe('易方达消费行业')
    expect(items[0]!.nav).toBeCloseTo(4.5)
    expect(items[0]!.dayPercent).toBeCloseTo(2.2)
    expect(items[0]!.yearPercent).toBeCloseTo(30.1)
    expect(() => parseFundRankText('no data here')).toThrow('fund rank data missing')
  })
})

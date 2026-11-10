import { describe, expect, it } from 'vitest'
import { fetchFuturesFxQuotes, parseCnFuturesQuote, parseFxQuote, parseIntlFuturesQuote } from '../src/core/providers/futures-fx'

/** 2026-11-10 实测原始行。 */
const NF_LINE = 'var hq_str_nf_IF0="4060.000,4068.600,4027.800,4045.000,34640,140153497.200,168173.000,0.000,0.000,4432.600,3627.000,0.000,0.000,4023.600,4029.800,173775.000,4044.400,7,0.000,0,0.000,0,0.000,0,0.000,0,4045.200,1,0.000,0";'
const HF_LINE = 'var hq_str_hf_OIL="91.510,,91.520,91.540,92.840,91.350,13:24:00,92.570,92.450,0,2,3,2026-11-10,伦敦原油,15423";'
const FX_LINE = 'var hq_str_fx_susdcny="13:23:00,6.6705000000,6.6706000000,6.6724000000,13.0000000000,6.6711000000,6.6718000000,6.6705000000,6.6705000000,离岸人民币,-0.0285,-0.0019,0.0013,中国金融在线,0.0000,0.0000,,2026-11-10";'

describe('parseCnFuturesQuote(国内期货,昨收=昨结算)', () => {
  it('现价/高低/昨结算,涨跌相对昨结', () => {
    const q = parseCnFuturesQuote('fut_cn:IF0', NF_LINE)
    expect(q!.price).toBeCloseTo(4045)
    expect(q!.open).toBeCloseTo(4060)
    expect(q!.high).toBeCloseTo(4068.6)
    expect(q!.low).toBeCloseTo(4027.8)
    expect(q!.prevClose).toBeCloseTo(4023.6) // 昨结算
    expect(q!.changePercent).toBeCloseTo(((4045 - 4023.6) / 4023.6) * 100, 1)
  })
})

describe('parseIntlFuturesQuote(国际期货)', () => {
  it('现价/昨收 [7]/高低', () => {
    const q = parseIntlFuturesQuote('fut_gl:OIL', HF_LINE)
    expect(q!.price).toBeCloseTo(91.51)
    expect(q!.prevClose).toBeCloseTo(92.57)
    expect(q!.high).toBeCloseTo(92.84)
    expect(q!.low).toBeCloseTo(91.35)
    expect(q!.time).toContain('2026-11-10')
  })
})

describe('parseFxQuote(外汇)', () => {
  it('现价 [1]/昨收 [3]/涨跌幅 [11] 数学自洽', () => {
    const q = parseFxQuote('fx:susdcny', FX_LINE)
    expect(q!.price).toBeCloseTo(6.6705)
    expect(q!.prevClose).toBeCloseTo(6.6724)
    expect(q!.changePercent).toBeCloseTo(-0.0285, 4)
    expect(q!.change).toBeCloseTo(-0.0019, 4)
  })
})

describe('fetchFuturesFxQuotes(路由)', () => {
  it('不支持的市场返回空', async () => {
    expect(await fetchFuturesFxQuotes(['cn_sh:600519' as never])).toEqual([])
  })
})

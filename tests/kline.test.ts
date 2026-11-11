import { describe, expect, it } from 'vitest'
import { parseFundHistory, parseKlineResponse, rangeToDays, toTencentSymbol } from '../src/core/providers/kline'

describe('toTencentSymbol', () => {
  it('cn_sh:600519 → sh600519;hk:00700 → hk00700;us:AAPL → usAAPL', () => {
    expect(toTencentSymbol('cn_sh:600519')).toBe('sh600519')
    expect(toTencentSymbol('hk:00700')).toBe('hk00700')
    expect(toTencentSymbol('us:AAPL')).toBe('usAAPL')
  })
  it('不支持的市场抛错', () => {
    expect(() => toTencentSymbol('fund:110022')).toThrow()
  })
})

describe('rangeToDays(FR-DATA-10)', () => {
  it('1w=5 1m=22 3m=66 6m=132 1y=264,未知回退 22', () => {
    expect(rangeToDays('1w')).toBe(5)
    expect(rangeToDays('1m')).toBe(22)
    expect(rangeToDays('3m')).toBe(66)
    expect(rangeToDays('6m')).toBe(132)
    expect(rangeToDays('1y')).toBe(264)
    expect(rangeToDays('2y')).toBe(22)
  })
})

describe('parseKlineResponse / parseFundHistory(#38 拆纯函数)', () => {
  it('fqkline:qfqday 优先,day 回退', () => {
    const base = { code: 0, data: { sh600519: {} } }
    const qfq = parseKlineResponse(
      { ...base, data: { sh600519: { qfqday: [['2026-11-18', '1500', '1510', '1512', '1498', '120']] } } },
      'sh600519',
    )
    expect(qfq[0]!).toEqual({ date: '2026-11-18', open: 1500, close: 1510, high: 1512, low: 1498, volume: 120 })
    const plain = parseKlineResponse(
      { ...base, data: { sh600519: { day: [['2026-11-18', '1500', '1510', '1512', '1498', '120']] } } },
      'sh600519',
    )
    expect(plain).toHaveLength(1)
  })

  it('code 非 0 / 数据缺失抛错', () => {
    expect(() => parseKlineResponse({ code: 1, data: {} }, 'sh600519')).toThrow('kline code 1')
    expect(() => parseKlineResponse({ code: 0, data: {} }, 'sh600519')).toThrow('kline data missing')
  })

  it('基金历史净值映射', () => {
    const list = parseFundHistory({ Data: { LSJZList: [{ FSRQ: '2026-11-17', DWJZ: '4.5', LJJZ: '4.5', JZZZL: '0.5' }] } })
    expect(list[0]!).toEqual({ date: '2026-11-17', nav: 4.5, accNav: 4.5, changePercent: 0.5 })
    expect(parseFundHistory({})).toEqual([])
  })
})

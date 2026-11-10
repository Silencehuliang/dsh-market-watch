import { describe, expect, it } from 'vitest'
import { parseTencentBatch, parseTencentQuote, toTencentCodes } from '../src/core/providers/tencent'

/** 2026-11-10 实测原始行(名称替换为正确 UTF-8)。 */
const HK_LINE =
  'v_hk00700="100~腾讯控股~00700~418.600~418.400~423.000~7717708.0~0~0~418.600~0~0~0~0~0~0~0~0~0~418.600~0~0~0~0~0~0~0~0~0~7717708.0~2026/11/10 13:10:16~0.200~0.05~424.400~415.400~418.600~7717708.0~3233009665.180~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~HKD~1~30";'
const US_LINE =
  'v_usAAPL="200~苹果~AAPL.OQ~350.69~342.37~345.00~48753052~0~0~350.45~120~0~0~0~0~0~0~0~0~350.60~40~0~0~0~0~0~0~0~0~~2026-11-09 16:00:01~8.32~2.43~352.33~344.78~USD~48753052~17078615942~0.34~39.05~~39.05~~2.21~50931.09754~5";'

describe('toTencentCodes', () => {
  it('hk:00700 → hk00700;us:AAPL → usAAPL', () => {
    expect(toTencentCodes(['hk:00700', 'us:AAPL' as never])).toBe('hk00700,usAAPL')
  })
  it('美股剥离交易所后缀(回归:实机发现搜索产出的 us:AAPL.OQ 致 pv_none_match)', () => {
    expect(toTencentCodes(['us:AAPL.OQ' as never])).toBe('usAAPL')
    expect(toTencentCodes(['us:BRK.B.N' as never])).toBe('usBRK.B') // 类股点保留,仅去交易所后缀
    expect(toTencentCodes(['us:BRK.B' as never])).toBe('usBRK.B')
  })
  it('不支持的 market 抛错', () => {
    expect(() => toTencentCodes(['cn_sh:600519' as never])).toThrow()
  })
})

describe('parseTencentQuote', () => {
  it('港股:现价/昨收/涨跌幅/币种 HKD', () => {
    const q = parseTencentQuote('hk:00700', HK_LINE.slice(HK_LINE.indexOf('=') + 1).replace(/"/g, ''))
    expect(q).not.toBeNull()
    expect(q!.name).toBe('腾讯控股')
    expect(q!.price).toBeCloseTo(418.6)
    expect(q!.prevClose).toBeCloseTo(418.4)
    expect(q!.changePercent).toBeCloseTo(0.05)
    expect(q!.high).toBeCloseTo(424.4)
    expect(q!.currency).toBe('HKD')
    expect(q!.time).toBe('2026-11-10 13:10:16')
    expect(q!.source).toBe('tencent')
  })
  it('美股:币种 USD(索引 35)', () => {
    const q = parseTencentQuote('us:AAPL', US_LINE.slice(US_LINE.indexOf('=') + 1).replace(/"/g, ''))
    expect(q!.price).toBeCloseTo(350.69)
    expect(q!.changePercent).toBeCloseTo(2.43)
    expect(q!.currency).toBe('USD')
    // 盘口一档(买一 120@350.45 / 卖一 40@350.60)→ 委比 (120−40)/160 = 50%
    expect(q!.bid1).toBeCloseTo(350.45)
    expect(q!.ask1).toBeCloseTo(350.6)
    expect(q!.bidVol1).toBe(120)
    expect(q!.askVol1).toBe(40)
    expect(q!.orderBookRatio).toBeCloseTo(50)
  })
  it('港股:盘口量为 0 → 一档价格保留、委比省略', () => {
    const q = parseTencentQuote('hk:00700', HK_LINE.slice(HK_LINE.indexOf('=') + 1).replace(/"/g, ''))
    expect(q!.bid1).toBeCloseTo(418.6)
    expect(q!.ask1).toBeCloseTo(418.6)
    expect(q!.bidVol1).toBeUndefined()
    expect(q!.askVol1).toBeUndefined()
    expect(q!.orderBookRatio).toBeUndefined()
  })
  it('价格 0 返回 null', () => {
    expect(parseTencentQuote('hk:00700', 'v_hk00700="100~x~00700~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0";'.replace('v_hk00700=', ''))).toBeNull()
  })
})

describe('parseTencentBatch', () => {
  it('按代码匹配多行', () => {
    const raw = `${HK_LINE}; ${US_LINE};`
    const out = parseTencentBatch(['hk:00700', 'us:AAPL' as never], raw)
    expect(out).toHaveLength(2)
    expect(out.map((q) => q.symbol)).toEqual(['hk:00700', 'us:AAPL'])
  })
  it('含交易所后缀的请求符号能在返回行中定位(回归:搜索 → 行情链路)', () => {
    const out = parseTencentBatch(['us:AAPL.OQ' as never], US_LINE)
    expect(out).toHaveLength(1)
    expect(out[0]!.symbol).toBe('us:AAPL.OQ')
    expect(out[0]!.currency).toBe('USD')
  })
})

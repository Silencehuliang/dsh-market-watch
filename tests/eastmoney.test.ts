import { describe, expect, it } from 'vitest'
import { parseFundEstimate } from '../src/core/providers/eastmoney'

const FIXTURE = {
  FCODE: '110022',
  SHORTNAME: '易方达消费行业股票',
  PDATE: '2026-11-06',
  NAV: '3.0050',
  ACCNAV: '3.0050',
  GSZ: '3.0100',
  GSZZL: '0.17',
  GZTIME: '2026-11-09 14:55',
}

describe('parseFundEstimate', () => {
  it('盘中:解析估值字段', () => {
    const e = parseFundEstimate(FIXTURE)
    expect(e.code).toBe('110022')
    expect(e.name).toBe('易方达消费行业股票')
    expect(e.navDate).toBe('2026-11-06')
    expect(e.nav).toBe(3.005)
    expect(e.estimateNav).toBe(3.01)
    expect(e.estimatePercent).toBe(0.17)
    expect(e.estimateTime).toBe('2026-11-09 14:55')
    expect(e.isEstimate).toBe(true)
    expect(e.source).toBe('eastmoney')
  })

  it('收盘后:GSZ/GSZZL/GZTIME 为 null → 估值字段 undefined', () => {
    const e = parseFundEstimate({ ...FIXTURE, GSZ: null, GSZZL: null, GZTIME: null })
    expect(e.estimateNav).toBeUndefined()
    expect(e.estimatePercent).toBeUndefined()
    expect(e.estimateTime).toBeUndefined()
    expect(e.nav).toBe(3.005) // 官方净值仍在
    expect(e.isEstimate).toBe(true)
  })
})

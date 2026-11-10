import { describe, expect, it } from 'vitest'
import { rangeToDays, toTencentSymbol } from '../src/core/providers/kline'

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

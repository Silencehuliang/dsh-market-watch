import { describe, expect, it } from 'vitest'
import {
  aStockSession,
  hkStockSession,
  isMarketOpen,
  isUSDst,
  isWeekend,
  usStockSession,
} from '../src/core/calendar'

describe('isWeekend (TC-CAL-01)', () => {
  it('周六/周日 → 周末', () => {
    expect(isWeekend(6)).toBe(true)
    expect(isWeekend(0)).toBe(true)
  })
  it('工作日 → 非周末', () => {
    expect(isWeekend(3)).toBe(false)
  })
})

describe('aStockSession (TC-CAL-02 / TC-CAL-03)', () => {
  it('TC-CAL-02 A股 12:00 → 午休', () => {
    expect(aStockSession(12, 0)).toBe('lunch')
  })
  it('TC-CAL-03 A股 16:00 → 收盘后', () => {
    expect(aStockSession(16, 0)).toBe('post')
  })
  it('A股 10:00 → 盘中', () => {
    expect(aStockSession(10, 0)).toBe('open')
  })
  it('A股 09:00 → 盘前', () => {
    expect(aStockSession(9, 0)).toBe('pre')
  })
})

describe('hkStockSession', () => {
  it('港股 12:30 → 午休', () => {
    expect(hkStockSession(12, 30)).toBe('lunch')
  })
  it('港股 14:00 → 盘中', () => {
    expect(hkStockSession(14, 0)).toBe('open')
  })
})

describe('usStockSession + isUSDst (TC-CAL-05)', () => {
  it('美股 10:00(美东)→ 盘中', () => {
    expect(usStockSession(10, 0)).toBe('open')
  })
  it('美股 08:00(美东)→ 盘前', () => {
    expect(usStockSession(8, 0)).toBe('pre')
  })
  it('美股 17:00(美东)→ 盘后', () => {
    expect(usStockSession(17, 0)).toBe('post')
  })
  it('7 月 → 美东夏令时(EDT)', () => {
    expect(isUSDst(new Date('2026-07-01T12:00:00Z'))).toBe(true)
  })
  it('1 月 → 美东冬令时(EST)', () => {
    expect(isUSDst(new Date('2026-01-01T12:00:00Z'))).toBe(false)
  })
})

describe('isMarketOpen (TC-CAL-04)', () => {
  it('节假日 → 休市', () => {
    expect(isMarketOpen('open', { isHoliday: true, isWeekend: false })).toBe(false)
  })
  it('周末 → 休市', () => {
    expect(isMarketOpen('open', { isHoliday: false, isWeekend: true })).toBe(false)
  })
  it('工作日盘中 → 开市', () => {
    expect(isMarketOpen('open', { isHoliday: false, isWeekend: false })).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  aStockSession,
  hkStockSession,
  isHoliday,
  isMarketOpen,
  isMarketOpenNow,
  isUSDst,
  isWeekend,
  marketStatus,
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

describe('交易日历(FR-DATA-07)', () => {
  it('isHoliday:2026 国庆(北京时间 10/1)→ true', () => {
    // 北京时间 2026-10-01 10:00 = UTC 02:00
    expect(isHoliday('cn_sh', new Date('2026-10-01T02:00:00Z'))).toBe(true)
  })
  it('isHoliday:2026 春节首日(北京时间 2/15)→ true', () => {
    expect(isHoliday('cn_sh', new Date('2026-02-15T02:00:00Z'))).toBe(true)
  })
  it('isHoliday:节后首个交易日(10/8)→ false', () => {
    expect(isHoliday('cn_sh', new Date('2026-10-08T02:00:00Z'))).toBe(false)
  })
  it('isHoliday:调休补班的周末股市仍休市(不在表内,由周末判定覆盖)', () => {
    // 2026-01-04(周日)国务院安排上班,但股市周末休市;表只含假期区间
    expect(isHoliday('cn_sh', new Date('2026-01-04T02:00:00Z'))).toBe(false)
  })
  it('isHoliday:港股/美股 M2 未内置表 → false', () => {
    expect(isHoliday('hk', new Date('2026-10-01T02:00:00Z'))).toBe(false)
    expect(isHoliday('us', new Date('2026-10-01T12:00:00Z'))).toBe(false)
  })
  it('isMarketOpenNow:节假日盘中 → false', () => {
    expect(isMarketOpenNow('cn_sh', new Date('2026-10-01T02:00:00Z'))).toBe(false)
  })
  it('isMarketOpenNow:2026-11-10(周二)北京时间 10:00 盘中 → true', () => {
    expect(isMarketOpenNow('cn_sh', new Date('2026-11-10T02:00:00Z'))).toBe(true)
  })
  it('isMarketOpenNow:周六 → false', () => {
    expect(isMarketOpenNow('cn_sh', new Date('2026-11-14T02:00:00Z'))).toBe(false)
  })
  it('isMarketOpenNow:港股时区,北京时间 16:30 = 港股 16:30 盘中(hk 交易至 16:00 → post → false)', () => {
    // 北京时间 16:30 = 香港时间 16:30(同时区),hk 已收盘
    expect(isMarketOpenNow('hk', new Date('2026-11-10T08:30:00Z'))).toBe(false)
  })
  it('isMarketOpenNow:美股夏令时盘中(美东 7/15 10:00 = UTC 14:00)→ true', () => {
    expect(isMarketOpenNow('us', new Date('2026-07-15T14:00:00Z'))).toBe(true)
  })
  it('isMarketOpenNow:美股冬令时盘中(美东 11/10 10:00 = UTC 15:00)→ true', () => {
    expect(isMarketOpenNow('us', new Date('2026-11-10T15:00:00Z'))).toBe(true)
  })
  it('isMarketOpenNow:fut_gl/fx 全天交易 → 恒 true', () => {
    expect(isMarketOpenNow('fut_gl', new Date('2026-11-14T02:00:00Z'))).toBe(true)
  })
  it('marketStatus:节假日 → post(收盘后)', () => {
    expect(marketStatus('cn_sh', new Date('2026-10-01T02:00:00Z'))).toBe('post')
  })
  it('marketStatus:周二盘中 → open', () => {
    expect(marketStatus('cn_sh', new Date('2026-11-10T02:00:00Z'))).toBe('open')
  })
  it('marketStatus:周二收盘后(北京时间 20:00)→ post', () => {
    expect(marketStatus('cn_sh', new Date('2026-11-10T12:00:00Z'))).toBe('post')
  })
})

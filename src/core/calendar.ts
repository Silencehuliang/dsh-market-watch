/**
 * 休市判定(纯函数,零依赖)。
 * 时段判定以「该市场本地时区的时分」为输入,时区转换由调用方负责;本模块只做纯时段逻辑。
 */

export type MarketStatus = 'pre' | 'open' | 'lunch' | 'post'

type TimeOfDay = [number, number]
interface Session {
  open: TimeOfDay
  close: TimeOfDay
}

function toMinutes([h, m]: TimeOfDay): number {
  return h * 60 + m
}

/** 通用时段判定:给定交易时段列表与可选午休区间,返回 pre/open/lunch/post。 */
function sessionFromRanges(
  h: number,
  m: number,
  sessions: Session[],
  lunch: Session | null,
): MarketStatus {
  const t = h * 60 + m
  for (const s of sessions) {
    if (t >= toMinutes(s.open) && t < toMinutes(s.close)) return 'open'
  }
  if (lunch && t >= toMinutes(lunch.open) && t < toMinutes(lunch.close)) return 'lunch'
  return t < toMinutes(sessions[0]!.open) ? 'pre' : 'post'
}

/** A 股(北京时间):09:30-11:30、13:00-15:00。 */
export function aStockSession(h: number, m: number): MarketStatus {
  return sessionFromRanges(
    h,
    m,
    [
      { open: [9, 30], close: [11, 30] },
      { open: [13, 0], close: [15, 0] },
    ],
    { open: [11, 30], close: [13, 0] },
  )
}

/** 港股:09:30-12:00、13:00-16:00。 */
export function hkStockSession(h: number, m: number): MarketStatus {
  return sessionFromRanges(
    h,
    m,
    [
      { open: [9, 30], close: [12, 0] },
      { open: [13, 0], close: [16, 0] },
    ],
    { open: [12, 0], close: [13, 0] },
  )
}

/** 美股(美东):09:30-16:00,无午休。 */
export function usStockSession(h: number, m: number): MarketStatus {
  return sessionFromRanges(
    h,
    m,
    [{ open: [9, 30], close: [16, 0] }],
    null,
  )
}

/** 周末判定(星期 0=周日,6=周六)。 */
export function isWeekend(dow: number): boolean {
  return dow === 0 || dow === 6
}

/** 综合时段 + 节假日 + 周末判断是否开市。 */
export function isMarketOpen(
  session: MarketStatus,
  opts: { isHoliday: boolean; isWeekend: boolean },
): boolean {
  if (opts.isHoliday || opts.isWeekend) return false
  return session === 'open'
}

/** 判断某时刻(UTC)是否处于美国东部夏令时(EDT)。 */
export function isUSDst(utc: Date): boolean {
  const year = utc.getUTCFullYear()
  const start = secondSundayOfMarchUTC(year) // 07:00 UTC
  const end = firstSundayOfNovemberUTC(year) // 06:00 UTC
  const t = utc.getTime()
  return t >= start && t < end
}

function secondSundayOfMarchUTC(year: number): number {
  const march1 = new Date(Date.UTC(year, 2, 1, 7, 0, 0))
  const dow = march1.getUTCDay()
  const firstSunday = 1 + ((7 - dow) % 7)
  return Date.UTC(year, 2, firstSunday + 7, 7, 0, 0)
}

function firstSundayOfNovemberUTC(year: number): number {
  const nov1 = new Date(Date.UTC(year, 10, 1, 6, 0, 0))
  const dow = nov1.getUTCDay()
  const firstSunday = 1 + ((7 - dow) % 7)
  return Date.UTC(year, 10, firstSunday, 6, 0, 0)
}

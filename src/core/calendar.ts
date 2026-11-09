/**
 * 休市判定(纯函数,零依赖)。
 * 时段判定以「该市场本地时区的时分」为输入,时区转换由调用方负责;本模块只做纯时段逻辑。
 */

export type MarketStatus = 'pre' | 'open' | 'lunch' | 'post'

function minutes(h: number, m: number): number {
  return h * 60 + m
}

function inSession(
  h: number,
  m: number,
  open: [number, number],
  close: [number, number],
): boolean {
  const t = minutes(h, m)
  return t >= minutes(open[0], open[1]) && t < minutes(close[0], close[1])
}

/** A 股(北京时间):09:30-11:30、13:00-15:00。 */
export function aStockSession(h: number, m: number): MarketStatus {
  if (inSession(h, m, [9, 30], [11, 30])) return 'open'
  if (inSession(h, m, [13, 0], [15, 0])) return 'open'
  if (minutes(h, m) >= minutes(11, 30) && minutes(h, m) < minutes(13, 0)) return 'lunch'
  if (minutes(h, m) < minutes(9, 30)) return 'pre'
  return 'post'
}

/** 港股:09:30-12:00、13:00-16:00。 */
export function hkStockSession(h: number, m: number): MarketStatus {
  if (inSession(h, m, [9, 30], [12, 0])) return 'open'
  if (inSession(h, m, [13, 0], [16, 0])) return 'open'
  if (minutes(h, m) >= minutes(12, 0) && minutes(h, m) < minutes(13, 0)) return 'lunch'
  if (minutes(h, m) < minutes(9, 30)) return 'pre'
  return 'post'
}

/** 美股(美东):09:30-16:00,无午休。 */
export function usStockSession(h: number, m: number): MarketStatus {
  if (inSession(h, m, [9, 30], [16, 0])) return 'open'
  if (minutes(h, m) < minutes(9, 30)) return 'pre'
  return 'post'
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

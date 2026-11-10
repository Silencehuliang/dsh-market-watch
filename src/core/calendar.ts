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

// ---------- 交易日历(FR-DATA-07):内置节假日表 + 时区 ----------

/**
 * A 股节假日(YYYY-MM-DD,含与周末重叠日;调休补班的周末股市仍休市,不入表)。
 * 来源:国务院办公厅《关于 2026 年部分节假日安排的通知》。
 * 注意:每年需手动更新一次(SRS FR-DATA-07)。
 */
export const CN_HOLIDAYS_2026: readonly string[] = [
  // 元旦 1/1(四)-1/3(六)
  '2026-01-01',
  '2026-01-02',
  '2026-01-03',
  // 春节 2/15(日)-2/23(一),共 9 天
  '2026-02-15',
  '2026-02-16',
  '2026-02-17',
  '2026-02-18',
  '2026-02-19',
  '2026-02-20',
  '2026-02-21',
  '2026-02-22',
  '2026-02-23',
  // 清明 4/4(六)-4/6(一)
  '2026-04-04',
  '2026-04-05',
  '2026-04-06',
  // 劳动节 5/1(五)-5/5(二)
  '2026-05-01',
  '2026-05-02',
  '2026-05-03',
  '2026-05-04',
  '2026-05-05',
  // 端午 6/19(五)-6/21(日)
  '2026-06-19',
  '2026-06-20',
  '2026-06-21',
  // 中秋 9/25(五)-9/27(日)
  '2026-09-25',
  '2026-09-26',
  '2026-09-27',
  // 国庆 10/1(四)-10/7(三)
  '2026-10-01',
  '2026-10-02',
  '2026-10-03',
  '2026-10-04',
  '2026-10-05',
  '2026-10-06',
  '2026-10-07',
]

/** 市场时区;null 表示近全天交易(fut_gl/fx),不做休市判定。 */
export function marketTimeZone(market: string): string | null {
  if (market === 'hk') return 'Asia/Hong_Kong'
  if (market === 'us') return 'America/New_York'
  if (market === 'cn_sh' || market === 'cn_sz' || market === 'cn_bj' || market === 'fut_cn' || market === 'fund') {
    return 'Asia/Shanghai'
  }
  return null
}

/** 市场本地时间的组成(星期 0=周日、时、分、YYYY-MM-DD 键)。 */
function marketLocalParts(
  timeZone: string,
  utc: Date,
): { dow: number; hour: number; minute: number; dateKey: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  })
  const parts = Object.fromEntries(fmt.formatToParts(utc).map((p) => [p.type, p.value]))
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const hour = Number(parts.hour) % 24 // en-CA 24h 下午夜可能输出 24
  return {
    dow: dowMap[parts.weekday ?? 'Mon'] ?? 1,
    hour,
    minute: Number(parts.minute),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  }
}

/** 判断某市场在某 UTC 时刻是否为节假日(非周末的休市日)。 */
export function isHoliday(market: string, utc: Date, table: readonly string[] = CN_HOLIDAYS_2026): boolean {
  const tz = marketTimeZone(market)
  if (!tz || (market !== 'cn_sh' && market !== 'cn_sz' && market !== 'cn_bj' && market !== 'fund')) {
    return false // M2 仅内置 A 股表;港股/美股节假日表随 M3 扩展
  }
  const { dateKey } = marketLocalParts(tz, utc)
  return table.includes(dateKey)
}

/**
 * 顶层开市判定(FR-DATA-07 接口):综合节假日 + 周末 + 市场时段。
 * 全天交易市场(fut_gl/fx)恒返回 true。
 */
export function isMarketOpenNow(market: string, utc: Date, table: readonly string[] = CN_HOLIDAYS_2026): boolean {
  const tz = marketTimeZone(market)
  if (!tz) return true
  const { dow, hour, minute, dateKey } = marketLocalParts(tz, utc)
  if (isWeekend(dow)) return false
  if (table.includes(dateKey)) return false
  const session =
    market === 'hk'
      ? hkStockSession(hour, minute)
      : market === 'us'
        ? usStockSession(hour, minute)
        : aStockSession(hour, minute)
  return session === 'open'
}

/** 是否交易日(非周末且非节假日)——简报跳过休市日用(FR-BRIEF)。 */
export function isTradingDay(market: string, utc: Date, table: readonly string[] = CN_HOLIDAYS_2026): boolean {
  const tz = marketTimeZone(market)
  if (!tz) return true
  const { dow, dateKey } = marketLocalParts(tz, utc)
  return !isWeekend(dow) && !table.includes(dateKey)
}

/** 顶层市场状态(open/closed/pre/post),供 Quote.status 填充。 */
export function marketStatus(
  market: string,
  utc: Date,
  table: readonly string[] = CN_HOLIDAYS_2026,
): 'open' | 'closed' | 'pre' | 'post' {
  const tz = marketTimeZone(market)
  if (!tz) return 'open'
  const { dow, hour, minute, dateKey } = marketLocalParts(tz, utc)
  // 周末与节假日明确为 closed(审查修复:此前落入 post,导致「已收盘」标注不触发)
  if (isWeekend(dow) || table.includes(dateKey)) return 'closed'
  const session =
    market === 'hk'
      ? hkStockSession(hour, minute)
      : market === 'us'
        ? usStockSession(hour, minute)
        : aStockSession(hour, minute)
  if (session === 'open') return 'open'
  if (session === 'pre') return 'pre'
  return 'closed' // lunch 与 post 都按「已收盘」呈现
}

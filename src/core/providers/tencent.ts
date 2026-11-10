/**
 * 腾讯行情 Provider(港股 hk: / 美股 us:;M0/T20 实测)。
 * 返回 `~` 分隔,统一索引:[1]名称 [2]代码 [3]现价 [4]昨收 [5]开盘 [6]成交量
 * [30]时间 [31]涨跌额 [32]涨跌幅 [33]最高 [34]最低;币种美股在 [35]、港股在 [75]。
 * 盘口一档:[9]买一价 [10]买一量 [19]卖一价 [20]卖一量。
 */
import type { Currency, Quote, SymbolId } from '../types.js'
import { fetchGb18030, parseNum as parseNumShared } from './http.js'

export function toTencentCodes(symbols: SymbolId[]): string {
  return symbols
    .map((s) => {
      const [market, code] = s.split(':') as [string, string]
      if (market === 'hk' || market === 'us') return `${market}${code}`
      throw new Error(`tencent provider does not support market: ${market}`)
    })
    .join(',')
}

const parseNum = parseNumShared

/** 解析单条腾讯行情(港股/美股同构)。 */
export function parseTencentQuote(symbol: SymbolId, raw: string): Quote | null {
  const f = raw.split('~')
  if (f.length < 35 || f[0] !== '100' && f[0] !== '200') return null
  const market = symbol.split(':')[0] as 'hk' | 'us'
  const currency: Currency =
    f[75] === 'HKD' || f[75] === 'USD' ? (f[75] as Currency) : f[35] === 'USD' ? 'USD' : market === 'hk' ? 'HKD' : 'USD'
  const price = parseNum(f[3])
  const prevClose = parseNum(f[4])
  if (price <= 0) return null
  // 盘口一档(港股实测量常为 0,仅在有量时参与委比)
  const bid1 = parseNum(f[9])
  const bidVol1 = parseNum(f[10])
  const ask1 = parseNum(f[19])
  const askVol1 = parseNum(f[20])
  const orderBookRatio =
    bidVol1 + askVol1 > 0 ? ((bidVol1 - askVol1) / (bidVol1 + askVol1)) * 100 : undefined
  return {
    symbol,
    name: f[1] ?? symbol,
    price,
    change: parseNum(f[31]),
    changePercent: parseNum(f[32]),
    open: parseNum(f[5]),
    high: parseNum(f[33]),
    low: parseNum(f[34]),
    prevClose,
    volume: parseNum(f[6]),
    bid1: bid1 > 0 ? bid1 : undefined,
    ask1: ask1 > 0 ? ask1 : undefined,
    bidVol1: bidVol1 > 0 ? bidVol1 : undefined,
    askVol1: askVol1 > 0 ? askVol1 : undefined,
    orderBookRatio,
    time: f[30]?.replace(/\//g, '-') ?? '',
    status: 'unknown',
    currency,
    source: 'tencent',
  }
}

/** 解析腾讯批量返回:按请求的 tencent code 精确定位 `v_<code>=` 行。 */
export function parseTencentBatch(symbols: SymbolId[], raw: string): Quote[] {
  const out: Quote[] = []
  for (const s of symbols) {
    const code = toTencentCodes([s])
    const idx = raw.indexOf(`v_${code}=`)
    if (idx < 0) continue
    const lineEnd = raw.indexOf(';', idx)
    const line = raw.slice(idx, lineEnd < 0 ? undefined : lineEnd)
    const q = parseTencentQuote(s, line.slice(line.indexOf('=') + 1).replace(/"/g, ''))
    if (q) out.push(q)
  }
  return out
}

/** 请求腾讯行情(宿主侧网络,GB18030 解码)。失败抛错,由 QuoteService 兜底。 */
export async function fetchTencentQuotes(symbols: SymbolId[]): Promise<Quote[]> {
  const codes = toTencentCodes(symbols)
  const text = await fetchGb18030(`https://qt.gtimg.cn/q=${codes}`)
  if (text.includes('pv_none_match')) throw new Error('tencent returned none_match')
  return parseTencentBatch(symbols, text)
}

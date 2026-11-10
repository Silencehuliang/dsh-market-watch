/**
 * 新浪期货(nf_ 国内 / hf_ 国际)与外汇(fx_)Provider(T20 实测)。
 * - 国内期货 nf_:逗号分隔,[0]开 [1]高 [2]低 [3]现价 [13]昨结算(涨跌相对昨结,期货惯例)
 * - 国际期货 hf_:[0]现价 [4]高 [5]低 [6]时间 [7]昨收 [8]开 [12]日期
 * - 外汇 fx_:[0]时间 [1]现价 [3]昨收 [10]涨跌幅% [11]涨跌额(实测数学自洽验证)
 */
import type { Quote, SymbolId } from '../types.js'
import { fetchGb18030, parseNum } from './http.js'

const csv = (raw: string): string[] => raw.replace(/^var\s+hq_str_\w+="|";?\s*$/g, '').split(',')

/** 国内期货(nf_):昨收 = 昨结算价。 */
export function parseCnFuturesQuote(symbol: SymbolId, raw: string): Quote | null {
  const f = csv(raw)
  const price = parseNum(f[3])
  if (price <= 0) return null
  const prevSettle = parseNum(f[13])
  return {
    symbol,
    name: symbol,
    price,
    change: parseNum(f[3]) - prevSettle,
    changePercent: prevSettle > 0 ? ((price - prevSettle) / prevSettle) * 100 : 0,
    open: parseNum(f[0]),
    high: parseNum(f[1]),
    low: parseNum(f[2]),
    prevClose: prevSettle,
    volume: parseNum(f[4]),
    amount: parseNum(f[5]),
    time: new Date().toISOString().slice(0, 19).replace('T', ' '),
    status: 'unknown',
    source: 'sina-futures',
  }
}

/** 国际期货(hf_):昨收 = [7]。 */
export function parseIntlFuturesQuote(symbol: SymbolId, raw: string): Quote | null {
  const f = csv(raw)
  const price = parseNum(f[0])
  if (price <= 0) return null
  const prevClose = parseNum(f[7])
  return {
    symbol,
    name: symbol,
    price,
    change: price - prevClose,
    changePercent: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
    open: parseNum(f[8]),
    high: parseNum(f[4]),
    low: parseNum(f[5]),
    prevClose,
    time: `${f[12] ?? ''} ${f[6] ?? ''}`.trim(),
    status: 'unknown',
    source: 'sina-futures',
  }
}

/** 外汇(fx_):[1]现价 [3]昨收;涨跌幅为 %。 */
export function parseFxQuote(symbol: SymbolId, raw: string): Quote | null {
  const f = csv(raw)
  const price = parseNum(f[1])
  if (price <= 0) return null
  const prevClose = parseNum(f[3])
  return {
    symbol,
    name: symbol,
    price,
    change: parseNum(f[11]),
    changePercent: parseNum(f[10]),
    open: parseNum(f[5]),
    prevClose,
    time: `${f[17] ?? ''} ${f[0] ?? ''}`.trim(),
    status: 'unknown',
    source: 'sina-fx',
  }
}

/** 单 symbol 的市场细分路由。 */
export function futuresFxKind(symbol: SymbolId): 'nf' | 'hf' | 'fx' | null {
  const market = symbol.split(':')[0]
  if (market === 'fut_cn') return 'nf'
  if (market === 'fut_gl') return 'hf'
  if (market === 'fx') return 'fx'
  return null
}

/** 请求新浪期货/外汇行情(GB18030)。失败抛错,由 QuoteService 兜底。 */
export async function fetchFuturesFxQuotes(symbols: SymbolId[]): Promise<Quote[]> {
  const codes = symbols
    .map((s) => {
      const kind = futuresFxKind(s)
      const code = s.split(':')[1]
      return { s, raw: `${kind}_${code}`, kind }
    })
    .filter((x) => x.kind !== null)
  if (codes.length === 0) return []
  const list = codes.map((x) => x.raw).join(',')
  const text = await fetchGb18030(`https://hq.sinajs.cn/list=${list}`, {
    referer: 'http://finance.sina.com.cn/',
  })
  const byRaw = new Map<string, string>()
  for (const line of text.split(';')) {
    const eq = line.indexOf('=')
    if (eq < 0) continue
    byRaw.set(line.slice(0, eq).trim().replace('var hq_str_', ''), line.slice(eq + 1))
  }
  const out: Quote[] = []
  for (const { s, raw, kind } of codes) {
    const body = byRaw.get(raw)
    if (!body) continue
    const q =
      kind === 'nf'
        ? parseCnFuturesQuote(s, body)
        : kind === 'hf'
          ? parseIntlFuturesQuote(s, body)
          : parseFxQuote(s, body)
    if (q) out.push(q)
  }
  return out
}

/** 汇率(FR-WL-06 外币折算):USD→CNY、HKD→CNY(新浪 fx_,[1]=现价)。 */
export async function fetchFxRates(): Promise<{ USD: number; HKD: number }> {
  const text = await fetchGb18030('https://hq.sinajs.cn/list=fx_susdcny,fx_shkdcny', {
    referer: 'http://finance.sina.com.cn/',
  })
  const parseFx = (raw: string | undefined): number => {
    if (!raw) throw new Error('fx rate missing')
    const f = csv(raw)
    const price = parseNum(f[1])
    if (price <= 0) throw new Error('fx rate invalid')
    return price
  }
  const usdcny = text.match(/fx_susdcny="([^"]+)"/)
  const hkdcny = text.match(/fx_shkdcny="([^"]+)"/)
  if (!usdcny || !hkdcny) throw new Error('fx rates missing')
  return { USD: parseFx(usdcny[1]), HKD: parseFx(hkdcny[1]) }
}

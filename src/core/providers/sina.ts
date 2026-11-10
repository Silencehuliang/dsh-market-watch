import type { Quote, SymbolId } from '../types.js'
import { normalizeSymbol, toProviderCode } from '../symbol.js'

/**
 * 新浪行情 Provider。请求 `https://hq.sinajs.cn/list=代码1,代码2`,
 * 返回 GB18030 编码的 `var hq_str_<code>="名称,今开,昨收,现价,最高,最低,...";`。
 * 盘口:[10..19]=买一量,买一价,…,买五量;[20..29]=卖一量,卖一价,…,卖五量。
 */

export const SINA_ID = 'sina'

/** 新浪 A 股返回解析(纯函数)。返回 null 表示无数据/不支持。 */
export function parseSinaStock(raw: string): Quote | null {
  const match = raw.match(/var hq_str_([\w$]+)="(.*)"/)
  if (!match) return null
  const code = match[1]!.replace('$', '.')
  const fields = match[2]!.split(',')
  if (fields.length < 32) return null

  const name = fields[0]!
  const open = Number(fields[1])
  const prevClose = Number(fields[2])
  const price = Number(fields[3])
  const high = Number(fields[4])
  const low = Number(fields[5])
  const volume = Number(fields[8])
  const amount = Number(fields[9])
  const date = fields[30]!
  const time = fields[31]!

  // 停牌/无数据:关键价格全为 0
  if (price === 0 && high === 0 && low === 0 && prevClose === 0) return null

  let symbol: SymbolId
  try {
    symbol = normalizeSymbol(code)
  } catch {
    return null
  }

  const change = price - prevClose
  const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0

  // 盘口五档(量价交替):[10]买一量 [11]买一价 … [18]买五量 [19]买五价;[20..29] 卖侧同构
  const bidVol1 = Number(fields[10])
  const bid1 = Number(fields[11])
  const askVol1 = Number(fields[20])
  const ask1 = Number(fields[21])
  const bidTotal = [10, 12, 14, 16, 18].reduce((s, i) => s + Number(fields[i]), 0)
  const askTotal = [20, 22, 24, 26, 28].reduce((s, i) => s + Number(fields[i]), 0)
  const orderBookRatio = bidTotal + askTotal > 0 ? ((bidTotal - askTotal) / (bidTotal + askTotal)) * 100 : undefined

  return {
    symbol,
    name,
    price,
    change,
    changePercent,
    open,
    high,
    low,
    prevClose,
    volume,
    amount,
    bid1: bid1 > 0 ? bid1 : undefined,
    ask1: ask1 > 0 ? ask1 : undefined,
    bidVol1: bidVol1 > 0 ? bidVol1 : undefined,
    askVol1: askVol1 > 0 ? askVol1 : undefined,
    orderBookRatio,
    time: `${date} ${time}`,
    status: 'unknown',
    source: SINA_ID,
  }
}

/** 把多个 SymbolId 转成新浪批量请求代码(逗号拼接)。 */
export function toSinaCodes(symbols: SymbolId[]): string {
  return symbols.map((s) => toProviderCode(s)).join(',')
}

/** 把新浪批量返回(多行)解析为 Quote 列表。 */
export function parseSinaBatch(raw: string): Quote[] {
  const quotes: Quote[] = []
  for (const line of raw.split(';')) {
    const q = parseSinaStock(line.trim())
    if (q) quotes.push(q)
  }
  return quotes
}

/** 请求新浪行情(宿主侧网络,GB18030 解码)。失败抛错,由 QuoteService 兜底。 */
export async function fetchSinaStocks(symbols: SymbolId[]): Promise<Quote[]> {
  const codes = toSinaCodes(symbols)
  const res = await fetch(`https://hq.sinajs.cn/list=${codes}`, {
    headers: { Referer: 'http://finance.sina.com.cn/' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`sina http ${res.status}`)
  const buf = await res.arrayBuffer()
  const text = new TextDecoder('gb18030').decode(buf)
  if (text.includes('FAILED')) throw new Error('sina returned FAILED')
  return parseSinaBatch(text)
}

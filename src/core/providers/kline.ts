/**
 * K线(腾讯 fqkline,A股/港股/美股统一)与基金历史净值(东财 f10/lsjz)Provider(FR-DATA-10,T26)。
 * #38:解析拆为纯函数(fixture 可测);网络统一走限频通道。
 */
import { fetchJson } from './http.js'
import type { SymbolId } from '../types.js'

export interface KBar {
  date: string
  open: number
  close: number
  high: number
  low: number
  volume: number
}

export function toTencentSymbol(symbol: SymbolId): string {
  const [market, code] = symbol.split(':') as [string, string]
  if (market === 'cn_sh' || market === 'cn_sz' || market === 'cn_bj') return `${market.split('_')[1]}${code}`
  if (market === 'hk' || market === 'us') return `${market}${code}`
  throw new Error(`kline does not support market: ${market}`)
}

export interface KlineResponse {
  code: number
  data: Record<string, Record<string, unknown>>
}

/** fqkline 响应解析(纯函数)。优先 qfqday(前复权),缺失回退 day。 */
export function parseKlineResponse(json: KlineResponse, ts: string): KBar[] {
  if (json.code !== 0) throw new Error(`kline code ${json.code}`)
  const node = json.data[ts]
  const rows = (node?.qfqday ?? node?.day) as string[][] | undefined
  if (!rows) throw new Error('kline data missing')
  return rows.map((r) => ({
    date: r[0] ?? '',
    open: Number(r[1]) || 0,
    close: Number(r[2]) || 0,
    high: Number(r[3]) || 0,
    low: Number(r[4]) || 0,
    volume: Number(r[5]) || 0,
  }))
}

/** 日K(FR-DATA-10:前复权)。days 为交易日数。 */
export async function fetchKline(symbol: SymbolId, days: number): Promise<KBar[]> {
  const ts = toTencentSymbol(symbol)
  const json = await fetchJson<KlineResponse>(
    `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${ts},day,,,${days},qfq`,
    { timeoutMs: 10000 },
  )
  return parseKlineResponse(json, ts)
}

export interface FundNavPoint {
  date: string
  nav: number
  accNav: number
  changePercent: number
}

export interface FundHistoryResponse {
  Data?: { LSJZList?: Array<{ FSRQ: string; DWJZ: string; LJJZ: string; JZZZL: string }> }
}

/** f10/lsjz 响应解析(纯函数)。 */
export function parseFundHistory(json: FundHistoryResponse): FundNavPoint[] {
  const list = json.Data?.LSJZList ?? []
  return list.map((x) => ({
    date: x.FSRQ,
    nav: Number(x.DWJZ) || 0,
    accNav: Number(x.LJJZ) || 0,
    changePercent: Number(x.JZZZL) || 0,
  }))
}

/** 基金历史净值(东财 f10/lsjz,M0 已实测;需 Referer,限频)。 */
export async function fetchFundHistory(code: string, days: number): Promise<FundNavPoint[]> {
  const json = await fetchJson<FundHistoryResponse>(
    `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=1&pageSize=${days}`,
    { referer: 'http://fundf10.eastmoney.com/', timeoutMs: 10000 },
  )
  return parseFundHistory(json)
}

/** 区间 → 交易日数(FR-DATA-10:1w/1m/3m/6m/1y)。 */
export function rangeToDays(range: string): number {
  const map: Record<string, number> = { '1w': 5, '1m': 22, '3m': 66, '6m': 132, '1y': 264 }
  return map[range] ?? 22
}

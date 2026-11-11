import type { FundEstimate } from '../types.js'
import { fetchJson } from './http.js'

export const EASTMONEY_ID = 'eastmoney'

/** 东方财富 FundMNFInfo 基金估值解析(纯函数)。 */
export function parseFundEstimate(item: Record<string, unknown>): FundEstimate {
  const num = (v: unknown): number | undefined => (v != null && v !== '' ? Number(v) : undefined)
  return {
    code: String(item.FCODE ?? ''),
    name: String(item.SHORTNAME ?? ''),
    navDate: String(item.PDATE ?? ''),
    nav: num(item.NAV),
    estimateNav: num(item.GSZ),
    estimatePercent: num(item.GSZZL),
    estimateTime: item.GZTIME != null ? String(item.GZTIME) : undefined,
    isEstimate: true,
    source: EASTMONEY_ID,
  }
}

/** 请求东方财富基金估值(宿主侧网络,限频)。收盘后 GSZ/GSZZL/GZTIME 为 null。 */
export async function fetchFundEstimates(codes: string[]): Promise<FundEstimate[]> {
  const json = await fetchJson<{ Datas?: Record<string, unknown>[] }>(
    `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?pageIndex=1&pageSize=${codes.length}&plat=Wap&deviceid=Wap&product=EFund&version=2.0.0&Fcodes=${codes.join(',')}`,
  )
  const datas = json.Datas ?? []
  return datas.map(parseFundEstimate)
}

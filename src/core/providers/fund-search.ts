/**
 * 东方财富场外基金搜索 Provider(M0 已实测):补腾讯搜索不含 OTC 基金的缺口。
 * `fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=关键词`
 */
import type { SearchResultItem } from '../types.js'
import { fetchJson } from './http.js'

/** 东财基金搜索解析(纯函数,fixture 可测)。 */
export function parseFundSearch(json: {
  Datas?: Array<{ CODE?: unknown; NAME?: unknown; CATEGORYDESC?: unknown }> | null
}): SearchResultItem[] {
  const datas = json.Datas ?? []
  return datas
    .filter((d) => d.CODE != null && d.NAME != null)
    .slice(0, 8)
    .map((d) => ({
      symbol: `fund:${String(d.CODE)}`,
      name: String(d.NAME),
      market: 'fund',
      type: 'fund',
    }))
}

/** 场外基金搜索(宿主侧网络,限频)。 */
export async function searchFunds(query: string): Promise<SearchResultItem[]> {
  const json = await fetchJson<Parameters<typeof parseFundSearch>[0]>(
    `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(query)}`,
  )
  return parseFundSearch(json)
}

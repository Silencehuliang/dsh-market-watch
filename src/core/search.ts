/**
 * 统一标的搜索(FR-WL-02):合并腾讯(股票/场内/指数)与东财(场外基金),
 * 按 symbol 去重;单源失败不阻塞另一源。
 */
import { searchFunds } from './providers/fund-search.js'
import { searchTencent } from './providers/tencent-search.js'
import type { SearchResultItem } from './types.js'

export async function searchSymbols(query: string): Promise<SearchResultItem[]> {
  const [tencent, funds] = await Promise.allSettled([searchTencent(query), searchFunds(query)])
  const items = [
    ...(tencent.status === 'fulfilled' ? tencent.value : []),
    ...(funds.status === 'fulfilled' ? funds.value : []),
  ]
  const seen = new Set<string>()
  return items.filter((i) => (seen.has(i.symbol) ? false : (seen.add(i.symbol), true)))
}

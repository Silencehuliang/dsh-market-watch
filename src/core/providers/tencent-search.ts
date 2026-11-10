/**
 * 腾讯搜索 Provider(M0 已实测):股票/场内基金/指数/美股。
 * 返回 `v_hint="市场~代码~名称~拼音~类型^..."`,名称为 \\uXXXX 转义,GB 页面但内容 ASCII 安全。
 */
import { normalizeSymbol } from '../symbol.js'
import type { SearchResultItem } from '../types.js'

function classify(t: string): string {
  if (t.startsWith('GP')) return 'stock'
  if (t === 'ZS') return 'index'
  if (t === 'ETF' || t === 'LOF' || t === 'FJ') return 'fund'
  return 'other'
}

function mapMarket(m: string): string | null {
  if (m === 'sh') return 'cn_sh'
  if (m === 'sz') return 'cn_sz'
  if (m === 'bj') return 'cn_bj'
  if (m === 'hk') return 'hk'
  if (m === 'us') return 'us'
  return null
}

/** 腾讯搜索返回解析(纯函数,fixture 可测)。 */
export function parseTencentSearch(raw: string): SearchResultItem[] {
  const match = raw.match(/v_hint="(.*)"/)
  if (!match) return []
  let decoded: string
  try {
    decoded = JSON.parse(`"${match[1]!}"`) as string
  } catch {
    decoded = match[1]!
  }
  const items: SearchResultItem[] = []
  for (const entry of decoded.split('^')) {
    const f = entry.split('~')
    if (f.length < 5) continue
    const tencentMarket = f[0]!
    const market = mapMarket(tencentMarket)
    if (!market) continue
    let symbol: string
    try {
      // normalizeSymbol 期望数据源代码(sh000847);美股腾讯无 gb_/usr_ 前缀,直接构造 SymbolId(M3 行情源适配)
      symbol =
        market === 'us' ? `us:${f[1]!.toUpperCase()}` : normalizeSymbol(`${tencentMarket}${f[1]}`)
    } catch {
      continue
    }
    items.push({ symbol, name: f[2]!, market, type: classify(f[4]!) })
  }
  return items
}

/** 腾讯搜索(宿主侧网络)。 */
export async function searchTencent(query: string): Promise<SearchResultItem[]> {
  const res = await fetch(
    `https://smartbox.gtimg.cn/s3/?v=2&q=${encodeURIComponent(query)}&t=all`,
    { signal: AbortSignal.timeout(8000) },
  )
  if (!res.ok) throw new Error(`tencent search http ${res.status}`)
  return parseTencentSearch(await res.text())
}

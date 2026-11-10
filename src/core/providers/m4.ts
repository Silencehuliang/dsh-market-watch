/**
 * M4 Providers:资金流向(东财 push2)/ 快讯(金十)/ 基金排行(东财 rankhandler)。T27 实测。
 */
import { fetchGb18030, parseNum } from './http.js'

// ---------- 资金流向(FR-DATA-11) ----------

export interface FlowItem {
  name: string
  /** 主力净流入(亿元)。 */
  netInflow: number
  changePercent: number
}

/** 板块/概念资金流排行(clist,f62=主力净流入元,f184=涨跌幅%)。 */
export async function fetchSectorFlow(kind: 'sector' | 'concept', limit = 10): Promise<FlowItem[]> {
  const fs = kind === 'sector' ? 'm:90+t:2' : 'm:90+t:3'
  const url = `https://push2.eastmoney.com/api/qt/clist/get?fid=f62&po=1&pz=${limit}&pn=1&np=1&fltt=2&invt=2&fs=${fs}&fields=f12,f14,f62,f184`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`flow http ${res.status}`)
  const json = (await res.json()) as { data?: { diff?: Array<{ f14: string; f62: number; f184: number }> } }
  return (json.data?.diff ?? []).map((d) => ({
    name: d.f14,
    netInflow: d.f62 / 1e8, // 元 → 亿
    changePercent: d.f184,
  }))
}

/** 沪深港通资金(kamt.rtmin,s2n 最后一行:时间,沪净流入,沪余额,深净流入,深余额,北向合计)。 */
export async function fetchHsgFlow(): Promise<{
  time: string
  shNet: number
  szNet: number
  northTotal: number
}> {
  const res = await fetch(
    'https://push2.eastmoney.com/api/qt/kamt.rtmin/get?fields1=f1,f3&fields2=f51,f52,f53,f54,f55,f56',
    { signal: AbortSignal.timeout(10000) },
  )
  if (!res.ok) throw new Error(`hsg http ${res.status}`)
  const json = (await res.json()) as { data?: { s2n?: string[] } }
  const lines = json.data?.s2n ?? []
  const last = lines[lines.length - 1]
  if (!last) throw new Error('hsg data empty')
  const f = last.split(',')
  return {
    time: f[0] ?? '',
    shNet: parseNum(f[1]) / 1e4, // 万 → 亿
    szNet: parseNum(f[3]) / 1e4,
    northTotal: parseNum(f[5]) / 1e4,
  }
}

// ---------- 快讯(FR-NEWS-01,金十单源;选股宝无公开 API) ----------

export interface NewsItem {
  id: string
  time: string
  title: string
  content: string
}

export async function fetchNewsFlash(limit = 20): Promise<NewsItem[]> {
  const res = await fetch('https://www.jin10.com/flash_newest.js', {
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`news http ${res.status}`)
  const text = await res.text()
  const jsonText = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
  const arr = JSON.parse(jsonText) as Array<{ id: string; time: string; data?: { title?: string; content?: string } }>
  return arr.slice(0, limit).map((x) => ({
    id: x.id,
    time: x.time,
    title: x.data?.title ?? '',
    content: x.data?.content ?? '',
  }))
}

// ---------- 基金排行 ----------

export interface FundRankItem {
  code: string
  name: string
  nav: number
  dayPercent: number
  yearPercent: number
}

/** 基金排行(sc=6yzf 日涨幅 / 1n 近一年)。 */
export async function fetchFundRank(sort: 'day' | 'year', limit = 10): Promise<FundRankItem[]> {
  const sc = sort === 'year' ? '1n' : '6yzf'
  const url = `https://fund.eastmoney.com/data/rankhandler.aspx?op=ph&dt=kf&ft=all&rs=&gs=0&sc=${sc}&st=fd&pi=1&pn=${limit}&dx=1`
  const text = await fetchGb18030(url, { referer: 'https://fund.eastmoney.com/data/fundranking.html' })
  const m = text.match(/datas:\[(.*?)\]/s)
  if (!m) throw new Error('fund rank data missing')
  const rows = JSON.parse(`[${m[1]}]`) as string[]
  return rows.map((row) => {
    const f = row.split(',')
    return {
      code: f[0] ?? '',
      name: f[1] ?? '',
      nav: parseNum(f[4]),
      dayPercent: parseNum(f[6]),
      yearPercent: parseNum(f[11]),
    }
  })
}

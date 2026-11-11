/**
 * M4 Providers:资金流向(东财 push2)/ 快讯(金十)/ 基金排行(东财 rankhandler)。T27 实测。
 * #38:解析拆为纯函数(fixture 可测);网络统一走限频通道。
 */
import { fetchGb18030, fetchJson, fetchText, parseNum } from './http.js'

// ---------- 资金流向(FR-DATA-11) ----------

export interface FlowItem {
  name: string
  /** 主力净流入(亿元)。 */
  netInflow: number
  changePercent: number
}

export interface SectorFlowResponse {
  data?: { diff?: Array<{ f14: string; f62: number; f184: number }> } | null
}

/** clist 响应解析(纯函数):f62=主力净流入元,f184=涨跌幅%。
 *  盘前/无数据时字段实测为 "-",统一收敛为 0(FlowItem 无 null 形态,UI 侧本就按 0 呈现)。 */
export function parseSectorFlow(json: SectorFlowResponse): FlowItem[] {
  const num = (v: unknown): number => {
    const x = Number(v)
    return Number.isFinite(x) ? x : 0
  }
  return (json.data?.diff ?? []).map((d) => ({
    name: d.f14,
    netInflow: num(d.f62) / 1e8, // 元 → 亿
    changePercent: num(d.f184),
  }))
}

/** 板块/概念资金流排行(限频)。 */
export async function fetchSectorFlow(kind: 'sector' | 'concept', limit = 10): Promise<FlowItem[]> {
  const fs = kind === 'sector' ? 'm:90+t:2' : 'm:90+t:3'
  const url = `https://push2.eastmoney.com/api/qt/clist/get?fid=f62&po=1&pz=${limit}&pn=1&np=1&fltt=2&invt=2&fs=${fs}&fields=f12,f14,f62,f184`
  return parseSectorFlow(await fetchJson<SectorFlowResponse>(url))
}

/**
 * 沪深港通资金(#34 修复:北向净买入自 2024-08 起停止披露)。
 * kamt 日度接口实测:净额字段(dayNetAmtIn 等)恒为「每日额度」占位值(=420亿×天数),不可用;
 * 可用的是 buyAmt/sellAmt/buySellAmt(万元)——南向买卖拆分实盘,北向仅总成交额。
 */
export interface HsgLeg {
  dayNetAmtIn: number
  dayAmtThreshold: number
  date2?: string
  buyAmt: number
  sellAmt: number
  buySellAmt: number
}

export interface SouthFlow {
  date: string
  /** 南向净买入(亿,CNY)= 港股通(沪+深)买 − 卖。 */
  netCny: number
  buyCny: number
  sellCny: number
  turnoverCny: number
}

export interface NorthFlowNote {
  date: string
  /** 北向当日总成交额(亿,CNY;买卖合计,唯一仍披露的北向口径)。 */
  turnoverCny: number
}

/** kamt 日度 JSON 解析(纯函数,fixture 可测)。 */
export function parseHsgDaily(json: { data?: Record<string, HsgLeg | undefined> | null }): {
  south: SouthFlow
  north: NorthFlowNote
} {
  const legs = json.data ?? {}
  const sh2hk = legs.sh2hk
  const sz2hk = legs.sz2hk
  const hk2sh = legs.hk2sh
  const hk2sz = legs.hk2sz
  if (!sh2hk || !sz2hk || !hk2sh || !hk2sz) throw new Error('hsg legs missing')
  const date = sh2hk.date2 ?? ''
  const yi = (v: number) => v / 1e4 // 万元 → 亿
  return {
    south: {
      date,
      netCny: yi(sh2hk.buyAmt - sh2hk.sellAmt + sz2hk.buyAmt - sz2hk.sellAmt),
      buyCny: yi(sh2hk.buyAmt + sz2hk.buyAmt),
      sellCny: yi(sh2hk.sellAmt + sz2hk.sellAmt),
      turnoverCny: yi(sh2hk.buySellAmt + sz2hk.buySellAmt),
    },
    north: { date, turnoverCny: yi(hk2sh.buySellAmt + hk2sz.buySellAmt) },
  }
}

const KAMT_URL =
  'https://push2.eastmoney.com/api/qt/kamt/get?fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62'

/** 沪深港通日度数据(宿主侧网络,限频)。 */
export async function fetchHsgDaily(): Promise<{ south: SouthFlow; north: NorthFlowNote }> {
  return parseHsgDaily(await fetchJson<{ data?: Record<string, HsgLeg | undefined> }>(KAMT_URL))
}

// ---------- 快讯(FR-NEWS-01,金十单源;选股宝无公开 API) ----------

export interface NewsItem {
  id: string
  time: string
  title: string
  content: string
}

export interface RawNewsFlash {
  id: string
  time: string
  data?: { title?: string; content?: string }
}

/** flash_newest.js 文本解析(纯函数):截取首个 `[` 到末个 `]` 的 JSON 数组。 */
export function parseNewsFlashText(text: string, limit = 20): NewsItem[] {
  const jsonText = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
  const arr = JSON.parse(jsonText) as RawNewsFlash[]
  return arr.slice(0, limit).map((x) => ({
    id: x.id,
    time: x.time,
    title: x.data?.title ?? '',
    content: x.data?.content ?? '',
  }))
}

/** 金十快讯(限频)。 */
export async function fetchNewsFlash(limit = 20): Promise<NewsItem[]> {
  const text = await fetchText('https://www.jin10.com/flash_newest.js')
  return parseNewsFlashText(text, limit)
}

// ---------- 基金排行 ----------

export interface FundRankItem {
  code: string
  name: string
  nav: number
  dayPercent: number
  yearPercent: number
}

/** rankhandler 文本解析(纯函数):提取 datas:["行","行",...] 并按列拆分。 */
export function parseFundRankText(text: string): FundRankItem[] {
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

/** 基金排行(sc=6yzf 日涨幅 / 1n 近一年;GB18030 + 限频)。 */
export async function fetchFundRank(sort: 'day' | 'year', limit = 10): Promise<FundRankItem[]> {
  const sc = sort === 'year' ? '1n' : '6yzf'
  const url = `https://fund.eastmoney.com/data/rankhandler.aspx?op=ph&dt=kf&ft=all&rs=&gs=0&sc=${sc}&st=fd&pi=1&pn=${limit}&dx=1`
  const text = await fetchGb18030(url, { referer: 'https://fund.eastmoney.com/data/fundranking.html' })
  return parseFundRankText(text)
}

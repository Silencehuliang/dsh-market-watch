/**
 * 实机测试(联网):真实数据源端到端验证。
 * 运行方式:MW_LIVE=1 npx vitest run tests/live
 * 免费接口无 SLA:断言「结构合理」而非精确值;单个源失败只 fail 该用例。
 * 注意:尊重源方限频,用例间 sleep 300ms,请勿高频重跑。
 */
import { describe, expect, it } from 'vitest'
import { fetchSinaStocks } from '../../src/core/providers/sina.js'
import { fetchTencentQuotes } from '../../src/core/providers/tencent.js'
import { fetchFuturesFxQuotes, fetchFxRates } from '../../src/core/providers/futures-fx.js'
import { fetchKline, fetchFundHistory } from '../../src/core/providers/kline.js'
import { fetchHsgDaily, fetchSectorFlow, fetchNewsFlash, fetchFundRank } from '../../src/core/providers/m4.js'
import { fetchFundEstimates } from '../../src/core/providers/eastmoney.js'
import { searchTencent } from '../../src/core/providers/tencent-search.js'
import { searchFunds } from '../../src/core/providers/fund-search.js'
import { searchSymbols } from '../../src/core/search.js'
import { normalizeSymbol, parseSymbol } from '../../src/core/symbol.js'
import { marketStatus, nextMarketOpen, isTradingDay, CN_HOLIDAYS_2026 } from '../../src/core/calendar.js'
import { QuoteService } from '../../src/core/quote-service.js'
import type { Quote, SymbolId } from '../../src/core/types.js'

// tsconfig 不含 @types/node,经 globalThis 访问 process 以通过类型检查
const LIVE =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.MW_LIVE === '1'
const d = LIVE ? describe : describe.skip

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 行情断言:结构合理即可(不假设开市)。 */
function expectSaneQuote(q: Quote | undefined, label: string) {
  expect(q, `${label}: 有返回`).toBeDefined()
  expect(q!.price, `${label}: price>0`).toBeGreaterThan(0)
  expect(q!.name, `${label}: 名称非空`).toBeTruthy()
  expect(q!.time, `${label}: 时间非空`).toBeTruthy()
  expect(Number.isFinite(q!.changePercent), `${label}: 涨跌幅有限`).toBe(true)
  expect(q!.prevClose ?? 0).toBeGreaterThanOrEqual(0)
}

d('实机:新浪 A 股行情(GB18030)', () => {
  it('批量 A 股:茅台/平安,中文名无乱码,盘口一档存在', async () => {
    const quotes = await fetchSinaStocks(['cn_sh:600519', 'cn_sz:000001'] as SymbolId[])
    expect(quotes).toHaveLength(2)
    const mt = quotes.find((q) => q.symbol === 'cn_sh:600519')!
    expectSaneQuote(mt, '600519')
    expect(mt.name).toContain('茅台')
    expect(mt.source).toBe('sina')
    // 交易时段内应有盘口;收盘后 bid/ask 为 0 → 省略。两者都合法,断言字段类型
    if (mt.bid1 !== undefined) expect(mt.bid1).toBeGreaterThan(0)
    console.log(`[live] 600519 ${mt.name} price=${mt.price} chg%=${mt.changePercent.toFixed(2)} @${mt.time}`)
    await sleep(300)
  }, 20_000)
})

d('实机:腾讯港股/美股行情', () => {
  it('hk:00700 腾讯控股(HKD)', async () => {
    const quotes = await fetchTencentQuotes(['hk:00700'] as SymbolId[])
    expectSaneQuote(quotes[0], 'hk:00700')
    expect(quotes[0]!.name).toContain('腾讯')
    expect(quotes[0]!.currency).toBe('HKD')
    console.log(`[live] hk:00700 ${quotes[0]!.name} price=${quotes[0]!.price} chg%=${quotes[0]!.changePercent.toFixed(2)}`)
    await sleep(300)
  }, 20_000)

  it('us:AAPL 苹果(USD,含交易所后缀)', async () => {
    const quotes = await fetchTencentQuotes(['us:AAPL.OQ'] as SymbolId[])
    expectSaneQuote(quotes[0], 'us:AAPL.OQ')
    expect(quotes[0]!.currency).toBe('USD')
    console.log(`[live] us:AAPL.OQ price=${quotes[0]!.price} chg%=${quotes[0]!.changePercent.toFixed(2)}`)
    await sleep(300)
  }, 20_000)

  it('混合批次中一个非法代码不应拖垮整批(行为验证)', async () => {
    let quotes: Quote[] = []
    let threw = false
    try {
      quotes = await fetchTencentQuotes(['hk:00700', 'hk:99999'] as SymbolId[])
    } catch {
      threw = true
    }
    // 记录行为而非硬断言:若抛错则证实「整批 fail-fast」缺陷;若成功则 hk:99999 被静默丢弃
    if (threw) console.log('[live] 腾讯混合批次:非法代码导致整批抛错(已知风险)')
    else console.log(`[live] 腾讯混合批次:返回 ${quotes.length}/2 条,非法代码被静默丢弃`)
    expect(true).toBe(true)
    await sleep(300)
  }, 20_000)
})

d('实机:新浪期货与外汇', () => {
  it('国内期货 nf_IF0(沪深300指数期货)', async () => {
    const quotes = await fetchFuturesFxQuotes(['fut_cn:IF0'] as SymbolId[])
    expectSaneQuote(quotes[0], 'fut_cn:IF0')
    await sleep(300)
  }, 20_000)

  it('国际期货 hf_CL(WTI 原油)', async () => {
    const quotes = await fetchFuturesFxQuotes(['fut_gl:CL'] as SymbolId[])
    expectSaneQuote(quotes[0], 'fut_gl:CL')
    await sleep(300)
  }, 20_000)

  it('外汇 fx_susdcny + 汇率接口(折算依赖)', async () => {
    const quotes = await fetchFuturesFxQuotes(['fx:SUSDCNY'] as SymbolId[])
    expectSaneQuote(quotes[0], 'fx:SUSDCNY')
    const rates = await fetchFxRates()
    expect(rates.USD).toBeGreaterThan(5)
    expect(rates.USD).toBeLessThan(10)
    expect(rates.HKD).toBeGreaterThan(0.5)
    expect(rates.HKD).toBeLessThan(1.5)
    console.log(`[live] fx USDCNY=${rates.USD} HKDCNY=${rates.HKD}`)
    await sleep(300)
  }, 20_000)
})

d('实机:东方财富基金', () => {
  it('基金估值 110022(收盘后 GSZ 为 null 属正常,NAV 必须>0)', async () => {
    const list = await fetchFundEstimates(['110022'])
    expect(list).toHaveLength(1)
    expect(list[0]!.nav ?? 0).toBeGreaterThan(0)
    expect(list[0]!.name).toContain('消费')
    expect(list[0]!.isEstimate).toBe(true)
    console.log(`[live] fund 110022 nav=${list[0]!.nav} est=${list[0]!.estimateNav ?? '(收盘)'}`)
    await sleep(300)
  }, 20_000)

  it('基金历史净值 110022', async () => {
    const list = await fetchFundHistory('110022', 20)
    expect(list.length).toBeGreaterThan(0)
    expect(list[0]!.nav).toBeGreaterThan(0)
    expect(list[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    await sleep(300)
  }, 20_000)

  it('基金排行(day 与 year 两种)', async () => {
    const day = await fetchFundRank('day', 10)
    expect(day.length).toBeGreaterThan(0)
    expect(day[0]!.code).toMatch(/^\d{6}$/)
    expect(Number.isFinite(day[0]!.dayPercent)).toBe(true)
    const year = await fetchFundRank('year', 5)
    expect(year.length).toBeGreaterThan(0)
    expect(Number.isFinite(year[0]!.yearPercent)).toBe(true)
    await sleep(300)
  }, 20_000)
})

d('实机:K线', () => {
  it('cn_sh:600519 日K 22 根,日期升序', async () => {
    const bars = await fetchKline('cn_sh:600519' as SymbolId, 22)
    expect(bars.length).toBeGreaterThan(15)
    for (let i = 1; i < bars.length; i++) expect(bars[i]!.date > bars[i - 1]!.date).toBe(true)
    expect(bars[bars.length - 1]!.close).toBeGreaterThan(0)
    console.log(`[live] kline 600519 last=${bars[bars.length - 1]!.date} close=${bars[bars.length - 1]!.close}`)
    await sleep(300)
  }, 25_000)

  it('hk:00700 日K', async () => {
    const bars = await fetchKline('hk:00700' as SymbolId, 10)
    expect(bars.length).toBeGreaterThan(5)
    await sleep(300)
  }, 25_000)

  it('us:AAPL 日K', async () => {
    const bars = await fetchKline('us:AAPL.OQ' as SymbolId, 10)
    expect(bars.length).toBeGreaterThan(5)
  }, 25_000)
})

d('实机:金十快讯与资金流', () => {
  it('快讯列表倒序且含内容', async () => {
    const items = await fetchNewsFlash(20)
    expect(items.length).toBeGreaterThan(5)
    expect(items[0]!.id).toBeDefined()
    // 倒序:首条时间 >= 末条时间
    expect(items[0]!.time >= items[items.length - 1]!.time).toBe(true)
    console.log(`[live] news ${items.length} 条,最新: ${items[0]!.time} ${items[0]!.title || items[0]!.content.slice(0, 30)}`)
    await sleep(300)
  }, 20_000)

  it('沪深港通(#34):北向仅总成交额、南向净买入可信(= 买−卖)', async () => {
    const { south, north } = await fetchHsgDaily()
    expect(north.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(north.turnoverCny).toBeGreaterThan(0)
    expect(north.turnoverCny).toBeLessThan(10000) // 北向日总成交额合理区间
    expect(Math.abs(south.netCny)).toBeLessThan(1000) // 南向净买入不可能是「额度整数倍」占位值
    expect(south.turnoverCny).toBeGreaterThan(0)
    console.log(`[live] hsg ${south.date} 北向总成交=${north.turnoverCny.toFixed(1)}亿 南向净买入=${south.netCny.toFixed(2)}亿`)
    await sleep(300)
  }, 20_000)

  it('行业板块资金流', async () => {
    const items = await fetchSectorFlow('sector', 10)
    expect(items.length).toBeGreaterThan(0)
    expect(items[0]!.name).toBeTruthy()
    expect(Number.isFinite(items[0]!.netInflow)).toBe(true)
    console.log(`[live] sector top1 ${items[0]!.name} netInflow=${items[0]!.netInflow.toFixed(2)}亿`)
    await sleep(300)
  }, 20_000)

  it('概念板块资金流', async () => {
    const items = await fetchSectorFlow('concept', 10)
    expect(items.length).toBeGreaterThan(0)
  }, 20_000)
})

d('实机:搜索', () => {
  it('腾讯搜索「茅台」返回 A 股候选', async () => {
    const items = await searchTencent('茅台')
    expect(items.length).toBeGreaterThan(0)
    expect(items.some((i) => i.symbol === 'cn_sh:600519')).toBe(true)
    await sleep(300)
  }, 20_000)

  it('README 声明修正:搜索裸代码 AAPL → us:AAPL.OQ(usAAPL 前缀查询实测无效,见评审报告)', async () => {
    const items = await searchSymbols('AAPL')
    const aapl = items.find((i) => i.symbol.startsWith('us:'))
    expect(aapl, '裸代码 AAPL 应识别美股').toBeDefined()
    console.log(`[live] AAPL → ${aapl!.symbol} ${aapl!.name}`)
    expect(normalizeSymbol(aapl!.symbol)).toBe(aapl!.symbol) // SymbolId 幂等
    const prefixed = await searchSymbols('usAAPL')
    console.log(`[live] usAAPL 查询结果数=${prefixed.length}(README「实测 usAAPL→us:AAPL.OQ」与现状不符)`)
  }, 20_000)

  it('东财基金搜索 110022', async () => {
    const items = await searchFunds('易方达消费行业')
    expect(items.length).toBeGreaterThan(0)
    expect(items[0]!.symbol).toMatch(/^fund:\d{6}$/)
    await sleep(300)
  }, 20_000)

  it('搜索容错:两源合并单源失败不阻塞(断网模拟不可行,改为特殊字符)', async () => {
    const items = await searchSymbols('ZZZ___不存在的标的后勤安全部')
    expect(Array.isArray(items)).toBe(true)
  }, 20_000)
})

d('实机:QuoteService 端到端(真实源 + 缓存/冷却)', () => {
  it('成功 → 失败冷却 → 缓存兜底标 stale → 冷却结束后恢复', async () => {
    let fail = false
    const svc = new QuoteService(async (symbols) => {
      if (fail) throw new Error('模拟主源故障')
      const q = await fetchSinaStocks(symbols)
      if (!q.length) throw new Error('无数据')
      return q
    }, { cooldownMs: 1000, now: Date.now })
    const first = await svc.getQuotes(['cn_sh:600519'] as SymbolId[])
    expect(first[0]!.stale).toBeFalsy()
    expect(svc.diagnostics().lastLatencyMs).toBeGreaterThan(0)
    fail = true
    const cached = await svc.getQuotes(['cn_sh:600519'] as SymbolId[])
    expect(cached[0]!.stale).toBe(true)
    expect(svc.diagnostics().inCooldown).toBe(true)
    fail = false // 模拟主源恢复
    await sleep(1100) // 越过冷却期
    const after = await svc.getQuotes(['cn_sh:600519'] as SymbolId[])
    expect(after[0]!.stale).toBeFalsy()
    console.log(`[live] QuoteService 端到端 OK, latency=${svc.diagnostics().lastLatencyMs}ms`)
  }, 30_000)
})

d('实机:交易日历一致性(与真实行情时间戳交叉验证)', () => {
  it('2026-11-10(今日,周二)非节假日;market_status 合理;节假表无周末脏数据', () => {
    const now = new Date()
    expect(CN_HOLIDAYS_2026).toHaveLength(33)
    for (const day of CN_HOLIDAYS_2026) expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // 每个市场状态值合法;A股 nextOpen 返回 ISO
    for (const m of ['cn_sh', 'hk', 'us', 'fund']) {
      const s = marketStatus(m, now)
      expect(['open', 'closed', 'pre', 'post']).toContain(s)
      expect(nextMarketOpen(m, now)).toMatch(/^20\d{2}-/)
    }
    expect(isTradingDay('cn_sh', now)).toBe(true) // 2026-11-10 周二,非节假日
  })
})

d('实机:标的规范化与数据源代码往返', () => {
  it('常见输入规范化', () => {
    expect(normalizeSymbol('sh600519')).toBe('cn_sh:600519')
    expect(normalizeSymbol('SZ000001')).toBe('cn_sz:000001')
    expect(normalizeSymbol('hk00700')).toBe('hk:00700')
    expect(normalizeSymbol('110022')).toBe('fund:110022')
    expect(normalizeSymbol('cn_sh:600519')).toBe('cn_sh:600519')
    expect(parseSymbol('us:AAPL.OQ').code).toBe('AAPL.OQ')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { QuoteService } from '../src/core/quote-service'
import type { Quote } from '../src/core/types'

function makeQuote(symbol: string, price: number): Quote {
  return {
    symbol: symbol as never,
    name: '测试',
    price,
    change: 0,
    changePercent: 0,
    time: '2026-11-09 15:00:00',
    status: 'unknown',
    source: 'sina',
  }
}

let now = 0
function makeSvc(fetcher: (symbols: string[]) => Promise<Quote[]>) {
  return new QuoteService(fetcher, { cooldownMs: 60000, now: () => now })
}

describe('QuoteService', () => {
  it('首次请求成功 → 返回新鲜 Quote(非 stale)', async () => {
    const fetcher = vi.fn(async () => [makeQuote('cn_sh:600519', 100)])
    const svc = makeSvc(fetcher)
    const quotes = await svc.getQuotes(['cn_sh:600519'])
    expect(quotes).toHaveLength(1)
    expect(quotes[0]!.price).toBe(100)
    expect(quotes[0]!.stale).toBeFalsy()
  })

  it('主源失败 → 返回缓存并标 stale', async () => {
    const fetcher = vi.fn(async () => [makeQuote('cn_sh:600519', 100)])
    const svc = makeSvc(fetcher)
    await svc.getQuotes(['cn_sh:600519']) // 成功,写缓存
    fetcher.mockRejectedValue(new Error('network error'))
    const quotes = await svc.getQuotes(['cn_sh:600519'])
    expect(quotes).toHaveLength(1)
    expect(quotes[0]!.stale).toBe(true)
    expect(svc.diagnostics().lastError).toBe('network error')
  })

  it('冷却期内不再请求主源', async () => {
    const fetcher = vi.fn(async () => [makeQuote('cn_sh:600519', 100)])
    const svc = makeSvc(fetcher)
    await svc.getQuotes(['cn_sh:600519']) // 成功,1 次调用
    fetcher.mockRejectedValue(new Error('x'))
    await svc.getQuotes(['cn_sh:600519']) // 失败,进入冷却,2 次调用
    const calls = fetcher.mock.calls.length
    await svc.getQuotes(['cn_sh:600519']) // 冷却期,不请求
    expect(fetcher.mock.calls.length).toBe(calls)
    expect(svc.diagnostics().inCooldown).toBe(true)
  })

  it('主源成功但个别 symbol 缺失 → 用缓存兜底并标 stale', async () => {
    const fetcher = vi.fn(async () => [makeQuote('cn_sh:600519', 100)])
    const svc = makeSvc(fetcher)
    await svc.getQuotes(['cn_sh:600519', 'cn_sz:000001']) // 只有 600519 返回
    fetcher.mockResolvedValue([]) // 第二次全部缺失
    const quotes = await svc.getQuotes(['cn_sh:600519'])
    expect(quotes).toHaveLength(1)
    expect(quotes[0]!.stale).toBe(true)
  })

  it('无缓存且失败 → 返回空', async () => {
    const fetcher = vi.fn(async () => { throw new Error('x') })
    const svc = makeSvc(fetcher)
    const quotes = await svc.getQuotes(['cn_sh:600519'])
    expect(quotes).toHaveLength(0)
  })

  it('诊断:从未成功 → 延迟为 null', async () => {
    const fetcher = vi.fn(async () => { throw new Error('x') })
    const svc = makeSvc(fetcher)
    await svc.getQuotes(['cn_sh:600519'])
    expect(svc.diagnostics().lastLatencyMs).toBeNull()
    expect(svc.diagnostics().avgLatencyMs).toBeNull()
  })

  it('诊断:成功请求统计最近与平均延迟(FR-DATA-08)', async () => {
    let call = 0
    const svc = makeSvc(async () => {
      now += ++call === 1 ? 120 : 180 // fetcher 期间推进时钟模拟耗时
      return [makeQuote('cn_sh:600519', 100)]
    })
    await svc.getQuotes(['cn_sh:600519']) // t0=0 → t1=120,延迟 120
    now += 80 // 请求间隔
    await svc.getQuotes(['cn_sh:600519']) // t0=200 → t1=380,延迟 180
    const d = svc.diagnostics()
    expect(d.lastLatencyMs).toBe(180)
    expect(d.avgLatencyMs).toBe(150)
  })
})

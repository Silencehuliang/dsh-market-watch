import type { Quote, SymbolId } from './types.js'

export interface QuoteServiceOptions {
  /** 缓存有效期(ms),默认 5000(等于轮询间隔)。 */
  ttlMs: number
  /** 主源失败后的冷却期(ms),默认 60000。 */
  cooldownMs: number
  now: () => number
}

export interface QuoteServiceDiagnostics {
  lastError: string | null
  lastSuccessAt: number
  inCooldown: boolean
}

/**
 * 行情编排:缓存 + 单源兜底 + 冷却期(ADR-0001)。
 * 主源失败(抛错)时返回缓存并标 stale;冷却期内不再请求主源。
 */
export class QuoteService {
  private cache = new Map<SymbolId, { quote: Quote; at: number }>()
  private cooldownUntil = 0
  private lastError: string | null = null
  private lastSuccessAt = 0

  constructor(
    private fetcher: (symbols: SymbolId[]) => Promise<Quote[]>,
    private opts: QuoteServiceOptions = { ttlMs: 5000, cooldownMs: 60000, now: Date.now },
  ) {}

  async getQuotes(symbols: SymbolId[]): Promise<Quote[]> {
    const now = this.opts.now()

    if (now < this.cooldownUntil) {
      return this.fromCache(symbols, now)
    }

    try {
      const fresh = await this.fetcher(symbols)
      const bySymbol = new Map(fresh.map((q) => [q.symbol, q]))
      this.lastSuccessAt = now
      this.lastError = null
      for (const q of fresh) this.cache.set(q.symbol, { quote: q, at: now })

      return symbols
        .map((s) => {
          const f = bySymbol.get(s)
          if (f) return f
          const c = this.cache.get(s)
          return c ? { ...c.quote, stale: true } : null
        })
        .filter((q): q is Quote => q !== null)
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e)
      this.cooldownUntil = now + this.opts.cooldownMs
      return this.fromCache(symbols, now)
    }
  }

  diagnostics(): QuoteServiceDiagnostics {
    return {
      lastError: this.lastError,
      lastSuccessAt: this.lastSuccessAt,
      inCooldown: this.opts.now() < this.cooldownUntil,
    }
  }

  private fromCache(symbols: SymbolId[], _now: number): Quote[] {
    const out: Quote[] = []
    for (const s of symbols) {
      const c = this.cache.get(s)
      if (c) out.push({ ...c.quote, stale: true })
    }
    return out
  }
}

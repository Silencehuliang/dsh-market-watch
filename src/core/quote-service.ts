import type { Quote, SymbolId } from './types.js'

export interface QuoteServiceOptions {
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
  private cache = new Map<SymbolId, Quote>()
  private cooldownUntil = 0
  private lastError: string | null = null
  private lastSuccessAt = 0

  constructor(
    private fetcher: (symbols: SymbolId[]) => Promise<Quote[]>,
    private opts: QuoteServiceOptions = { cooldownMs: 60000, now: Date.now },
  ) {}

  async getQuotes(symbols: SymbolId[]): Promise<Quote[]> {
    const now = this.opts.now()

    if (now < this.cooldownUntil) {
      return this.fromCache(symbols)
    }

    try {
      const fresh = await this.fetcher(symbols)
      const bySymbol = new Map(fresh.map((q) => [q.symbol, q]))
      this.lastSuccessAt = now
      this.lastError = null
      for (const q of fresh) this.cache.set(q.symbol, q)

      return symbols
        .map((s) => {
          const f = bySymbol.get(s)
          if (f) return f
          const c = this.cache.get(s)
          return c ? { ...c, stale: true } : null
        })
        .filter((q): q is Quote => q !== null)
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e)
      this.cooldownUntil = now + this.opts.cooldownMs
      return this.fromCache(symbols)
    }
  }

  diagnostics(): QuoteServiceDiagnostics {
    return {
      lastError: this.lastError,
      lastSuccessAt: this.lastSuccessAt,
      inCooldown: this.opts.now() < this.cooldownUntil,
    }
  }

  /**
   * 只读缓存(不触发网络)。休市市场用它兜底:
   * 收盘价就是缓存里的最后行情,数据并未「过期」,因此**不标 stale**。
   * 缓存缺失的 symbol 不返回(由调用方决定是否强制 fetch 一次)。
   */
  peekCached(symbols: SymbolId[]): Quote[] {
    const out: Quote[] = []
    for (const s of symbols) {
      const c = this.cache.get(s)
      if (c) out.push({ ...c, stale: false })
    }
    return out
  }

  /** 缓存兜底:一律标 stale(主源失败,无法确认新鲜)。 */
  private fromCache(symbols: SymbolId[]): Quote[] {
    const out: Quote[] = []
    for (const s of symbols) {
      const c = this.cache.get(s)
      if (c) out.push({ ...c, stale: true })
    }
    return out
  }
}

/**
 * 标的规范化(纯函数,零依赖)。
 * 内部统一用 `{market}:{code}` 标识,与各数据源代码双向转换(FR-DATA-01)。
 */

export type Market =
  | 'cn_sh'
  | 'cn_sz'
  | 'cn_bj'
  | 'hk'
  | 'us'
  | 'fund'
  | 'fut_cn'
  | 'fut_gl'
  | 'fx'

export type SymbolId = `${Market}:${string}`

/** 标的规范化失败时抛出的明确错误(可捕获,非意外崩溃)。 */
export class SymbolError extends Error {
  constructor(
    public readonly input: string,
    message: string,
  ) {
    super(message)
    this.name = 'SymbolError'
  }
}

/** 各数据源代码 → 统一 SymbolId。非法输入抛出 SymbolError。对已是 SymbolId 的输入幂等。 */
export function normalizeSymbol(input: string): SymbolId {
  const raw = input.trim()
  if (!raw) throw new SymbolError(input, 'empty symbol')

  // 幂等:输入已是 SymbolId 形式(市场段合法)则原样返回——Remote/存储层的 key 都是这个形态
  const idForm = raw.match(/^(cn_sh|cn_sz|cn_bj|hk|us|fund|fut_cn|fut_gl|fx):(.+)$/)
  if (idForm) return `${idForm[1]}:${idForm[2]}` as SymbolId

  // A 股三所:sh/sz/bj + 6 位数字
  const aShare = raw.match(/^(sh|sz|bj)(\d{6})$/i)
  if (aShare) {
    const m = aShare[1]!.toLowerCase()
    const market = m === 'sh' ? 'cn_sh' : m === 'sz' ? 'cn_sz' : 'cn_bj'
    return `${market}:${aShare[2]}`
  }

  // 港股:hk + 数字(保留前导零)
  const hk = raw.match(/^hk(\d+)$/i)
  if (hk) return `hk:${hk[1]}`

  // 美股:gb_ / usr_ 前缀(前缀以实测为准)
  const us = raw.match(/^(gb_|usr_)(.+)$/i)
  if (us) return `us:${us[2]!.toUpperCase()}`

  // 国内期货:nf_ / 国际期货:hf_
  const futCn = raw.match(/^nf_(.+)$/i)
  if (futCn) return `fut_cn:${futCn[1]!.toUpperCase()}`
  const futGl = raw.match(/^hf_(.+)$/i)
  if (futGl) return `fut_gl:${futGl[1]!.toUpperCase()}`

  // 外汇:fx_
  const fx = raw.match(/^fx_(.+)$/i)
  if (fx) return `fx:${fx[1]!.toUpperCase()}`

  // 基金:纯 6 位数字
  if (/^\d{6}$/.test(raw)) return `fund:${raw}`

  throw new SymbolError(input, `unknown symbol: ${raw}`)
}

/** SymbolId → 各数据源代码(新浪/腾讯等所需前缀)。美股默认 usr_ 前缀(【待验证】)。 */
export function toProviderCode(symbol: SymbolId): string {
  const { market, code } = parseSymbol(symbol)
  switch (market) {
    case 'cn_sh':
      return `sh${code}`
    case 'cn_sz':
      return `sz${code}`
    case 'cn_bj':
      return `bj${code}`
    case 'hk':
      return `hk${code}`
    case 'us':
      return `usr_${code}`
    case 'fund':
      return code
    case 'fut_cn':
      return `nf_${code}`
    case 'fut_gl':
      return `hf_${code}`
    case 'fx':
      return `fx_${code}`
  }
}

/** 拆分 SymbolId 为 { market, code }。 */
export function parseSymbol(symbol: SymbolId): { market: Market; code: string } {
  const idx = symbol.indexOf(':')
  if (idx <= 0) throw new SymbolError(symbol, `malformed symbol id: ${symbol}`)
  return { market: symbol.slice(0, idx) as Market, code: symbol.slice(idx + 1) }
}

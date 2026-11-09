import { describe, expect, it } from 'vitest'
import { SymbolError, normalizeSymbol, parseSymbol, toProviderCode } from '../src/core/symbol'

describe('normalizeSymbol', () => {
  it.each([
    ['sh600519', 'cn_sh:600519'],
    ['sz000001', 'cn_sz:000001'],
    ['bj430047', 'cn_bj:430047'],
    ['hk00700', 'hk:00700'],
    ['gb_aapl', 'us:AAPL'],
    ['usr_aapl', 'us:AAPL'],
    ['110022', 'fund:110022'],
    ['nf_IF0', 'fut_cn:IF0'],
    ['hf_OIL', 'fut_gl:OIL'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeSymbol(input)).toBe(expected)
  })

  it('throws a typed SymbolError on invalid input (not an uncaught exception)', () => {
    expect(() => normalizeSymbol('xyz123')).toThrow(SymbolError)
    expect(() => normalizeSymbol('')).toThrow(SymbolError)
  })
})

describe('toProviderCode', () => {
  it.each([
    ['cn_sh:600519', 'sh600519'],
    ['cn_sz:000001', 'sz000001'],
    ['cn_bj:430047', 'bj430047'],
    ['hk:00700', 'hk00700'],
    ['us:AAPL', 'usr_AAPL'],
    ['fund:110022', '110022'],
    ['fut_cn:IF0', 'nf_IF0'],
    ['fut_gl:OIL', 'hf_OIL'],
  ])('converts %s to %s', (input, expected) => {
    expect(toProviderCode(input as never)).toBe(expected)
  })

  it('round-trips normalizeSymbol -> toProviderCode -> normalizeSymbol', () => {
    for (const raw of ['sh600519', 'sz000001', 'hk00700', '110022', 'nf_IF0', 'hf_OIL']) {
      expect(normalizeSymbol(toProviderCode(normalizeSymbol(raw)))).toBe(normalizeSymbol(raw))
    }
  })
})

describe('parseSymbol', () => {
  it('splits market and code', () => {
    expect(parseSymbol('cn_sh:600519')).toEqual({ market: 'cn_sh', code: '600519' })
    expect(parseSymbol('hk:00700')).toEqual({ market: 'hk', code: '00700' })
  })
})

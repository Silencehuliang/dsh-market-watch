import { describe, expect, it } from 'vitest'
import { parseFxQuote } from '../src/core/providers/futures-fx'

describe('汇率解析(FR-WL-06 依赖的 fx_ 字段)', () => {
  it('USD→CNY:[1] 为汇率价', () => {
    const line =
      'var hq_str_fx_susdcny="13:23:00,6.6705000000,6.6706000000,6.6724000000,13.0000000000,6.6711000000,6.6718000000,6.6705000000,6.6705000000,离岸人民币,-0.0285,-0.0019,0.0013,中国金融在线,0.0000,0.0000,,2026-11-10";'
    const q = parseFxQuote('fx:susdcny', line)
    expect(q!.price).toBeCloseTo(6.6705) // 1 USD = 6.6705 CNY
  })
  it('HKD→CNY', () => {
    const line =
      'var hq_str_fx_shkdcny="13:22:57,0.8505354120,0.8505354120,0.8509407150,6.0798550000,0.8509624385,0.8510638298,0.8504558443,0.8505354120,港元兑人民币,-0.0476,-0.0004,0.0006,中国金融在线,0.0000,0.0000,,2026-11-10";'
    const q = parseFxQuote('fx:shkdcny', line)
    expect(q!.price).toBeCloseTo(0.8505354, 6) // 1 HKD = 0.8505 CNY
  })
})

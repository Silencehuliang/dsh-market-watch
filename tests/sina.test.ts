import { describe, expect, it } from 'vitest'
import { parseSinaBatch, parseSinaStock, toSinaCodes } from '../src/core/providers/sina'

const FIXTURE =
  'var hq_str_sh600519="贵州茅台,1440.060,1453.000,1444.990,1449.990,1435.080,1444.900,1444.990,2480122,3578407287.000,100,1444.900,200,1444.890,400,1444.870,200,1444.300,100,1444.290,4000,1444.990,13333,1445.000,200,1445.080,200,1445.200,500,1445.390,2026-11-09,15:34:59,00,D|1100|1589489.00";'

describe('parseSinaStock', () => {
  it('解析 A 股字段为 Quote', () => {
    const q = parseSinaStock(FIXTURE)
    expect(q).not.toBeNull()
    expect(q!.symbol).toBe('cn_sh:600519')
    expect(q!.name).toBe('贵州茅台')
    expect(q!.price).toBe(1444.99)
    expect(q!.prevClose).toBe(1453.0)
    expect(q!.open).toBe(1440.06)
    expect(q!.high).toBe(1449.99)
    expect(q!.low).toBe(1435.08)
    expect(q!.volume).toBe(2480122)
    expect(q!.amount).toBe(3578407287)
    expect(q!.change).toBeCloseTo(-8.01, 2)
    expect(q!.changePercent).toBeCloseTo(-0.5513, 3)
    expect(q!.source).toBe('sina')
    // 盘口一档(fixture 买一 100@1444.900 / 卖一 4000@1444.990)
    expect(q!.bid1).toBe(1444.9)
    expect(q!.ask1).toBe(1444.99)
    expect(q!.bidVol1).toBe(100)
    expect(q!.askVol1).toBe(4000)
    // 五档委比:买 100+200+400+200+100=1000,卖 4000+13333+200+200+500=18233
    expect(q!.orderBookRatio).toBeCloseTo(-89.6, 1)
  })

  it('停牌(关键价格全 0)→ 返回 null', () => {
    const halted = 'var hq_str_sh600000="浦发银行,0.000,0.000,0.000,0.000,0.000,0.000,0.000,0,0.000,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2026-11-09,00:00:00,00,";'
    expect(parseSinaStock(halted)).toBeNull()
  })

  it('无效输入 → 返回 null', () => {
    expect(parseSinaStock('')).toBeNull()
    expect(parseSinaStock('FAILED')).toBeNull()
  })
})

describe('toSinaCodes', () => {
  it('批量拼接为逗号分隔的新浪代码', () => {
    expect(toSinaCodes(['cn_sh:600519', 'cn_sz:000001'])).toBe('sh600519,sz000001')
  })
})

describe('parseSinaBatch', () => {
  it('解析多行返回为 Quote 列表', () => {
    const batch = `${FIXTURE}\nvar hq_str_sz000001="平安银行,11.000,10.900,11.100,11.200,10.800,11.100,11.110,100000,1100000.000,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2026-11-09,15:35:00,00,";`
    const quotes = parseSinaBatch(batch)
    expect(quotes).toHaveLength(2)
    expect(quotes[0]!.symbol).toBe('cn_sh:600519')
    expect(quotes[1]!.symbol).toBe('cn_sz:000001')
    // 全零盘口 → 一档与委比省略
    expect(quotes[1]!.bid1).toBeUndefined()
    expect(quotes[1]!.ask1).toBeUndefined()
    expect(quotes[1]!.orderBookRatio).toBeUndefined()
  })
})

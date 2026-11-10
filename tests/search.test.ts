import { describe, expect, it } from 'vitest'
import { parseTencentSearch } from '../src/core/providers/tencent-search'
import { parseFundSearch } from '../src/core/providers/fund-search'

// 腾讯搜索实测返回(2026-11-10,搜「腾讯」):条目 ^ 分隔,字段 ~ 分隔,名称 \\u 转义
const TENCENT_FIXTURE =
  'v_hint="sh~000847~\\u817e\\u8baf\\u6d4e\\u5b89~txja~ZS^hk~00700~\\u817e\\u8baf\\u63a7\\u80a1~txkg~GP^hk~80700~\\u817e\\u8baf\\u63a7\\u80a1r~txkgr~GP^hk~13005~\\u817e\\u8baf\\u6cd5\\u5174\\u4e03\\u4e09\\u8d2dA~txfxqsga~QZ^us~tcehy.ps~\\u817e\\u8baf\\u63a7\\u80a1adr~txkgadr~GP"'

describe('parseTencentSearch', () => {
  it('解析条目、解码 unicode 名称、映射类型', () => {
    const items = parseTencentSearch(TENCENT_FIXTURE)
    expect(items.length).toBeGreaterThanOrEqual(3)
    expect(items[0]!.symbol).toBe('cn_sh:000847')
    expect(items[0]!.name).toBe('腾讯济安')
    expect(items[0]!.type).toBe('index')
    expect(items[1]!.symbol).toBe('hk:00700')
    expect(items[1]!.name).toBe('腾讯控股')
    expect(items[1]!.type).toBe('stock')
    // 权证(QZ)→ other
    expect(items[3]!.type).toBe('other')
  })
  it('无效输入返回空数组', () => {
    expect(parseTencentSearch('')).toEqual([])
    expect(parseTencentSearch('FAILED')).toEqual([])
  })
})

describe('parseFundSearch', () => {
  it('解析场外基金候选为 fund:<code>', () => {
    const items = parseFundSearch({
      Datas: [{ CODE: '009265', NAME: '易方达消费精选股票', CATEGORYDESC: '基金' }],
    })
    expect(items).toHaveLength(1)
    expect(items[0]!.symbol).toBe('fund:009265')
    expect(items[0]!.name).toBe('易方达消费精选股票')
    expect(items[0]!.type).toBe('fund')
  })
  it('Datas 为 null 返回空数组', () => {
    expect(parseFundSearch({ Datas: null })).toEqual([])
  })
})

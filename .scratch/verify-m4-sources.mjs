/** M4 数据源实测:资金流向/快讯/基金排行。 */
const probe = async (name, url, headers = {}, slice = 300) => {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return console.log(`❌ ${name}: HTTP ${res.status}`)
    const t = await res.text()
    console.log(`✅ ${name} (${res.status}): ${t.slice(0, slice).replace(/\n/g, ' ⏎ ')}`)
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`)
  }
}

// 资金流向:东财 push2(沪深港通资金)
await probe(
  '资金流-沪深港通 kamt.rtmin',
  'https://push2.eastmoney.com/api/qt/kamt.rtmin/get?fields1=f1,f3&fields2=f51,f52,f53,f54,f55,f56',
)
// 板块资金流排行(行业板块 f62=主力净流入)
await probe(
  '资金流-板块排行 clist',
  'https://push2.eastmoney.com/api/qt/clist/get?fid=f62&po=1&pz=5&pn=1&np=1&fltt=2&invt=2&fs=m:90+t:2&fields=f12,f14,f62,f184',
)
// 概念板块
await probe(
  '资金流-概念排行 clist',
  'https://push2.eastmoney.com/api/qt/clist/get?fid=f62&po=1&pz=5&pn=1&np=1&fltt=2&invt=2&fs=m:90+t:3&fields=f12,f14,f62,f184',
)
// 快讯:金十
await probe('快讯-金十 flash_newest', 'https://flash-c.jin10.com/flash_newest.js')
await probe('快讯-金十 www', 'https://www.jin10.com/flash_newest.js')
// 快讯:选股宝
await probe('快讯-选股宝 brief', 'https://xuangubao.cn/ding_pan/brief')
// 基金排行:东财
await probe(
  '基金排行-东财 mobapi',
  'https://fundmobapi.eastmoney.com/FundRank/List?Sort=3&Page=1&PageSize=5&FundType=0&IsSale=1',
)
await probe(
  '基金排行-东财 fundrank',
  'https://fund.eastmoney.com/data/rankhandler.aspx?op=ph&dt=kf&ft=all&rs=&gs=0&sc=6yzf&st=fd&sd=2025-11-10&ed=2026-11-10&qdii=&tabSubtype=,,,,,&pi=1&pn=5&dx=1',
  {},
  400,
)

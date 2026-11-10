/** 基金排行源变体补测。 */
const probe = async (name, url, headers = {}, slice = 260) => {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return console.log(`❌ ${name}: HTTP ${res.status}`)
    const t = await res.text()
    console.log(`✅ ${name} (${res.status}): ${t.slice(0, slice).replace(/\n/g, ' ⏎ ')}`)
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`)
  }
}

await probe(
  'rankhandler + Referer',
  'https://fund.eastmoney.com/data/rankhandler.aspx?op=ph&dt=kf&ft=all&rs=&gs=0&sc=6yzf&st=fd&sd=2025-11-10&ed=2026-11-10&qdii=&tabSubtype=,,,,,&pi=1&pn=5&dx=1',
  { Referer: 'https://fund.eastmoney.com/data/fundranking.html' },
)
await probe(
  'mobapi FundMNRankList',
  'https://fundmobapi.eastmoney.com/FundRank/NewFundRankList?Sort=3&Page=1&PageSize=5&FundType=0&IsSale=1&plat=Wap&deviceid=Wap&product=EFund&version=6.2.5',
)

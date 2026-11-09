const code = '110022'
const variants = [
  { name: 'eastmoney-FundMNFInfo-single', url: `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?FCODE=${code}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0&MobileKey=1` },
  { name: 'eastmoney-FundMNFInfo-list', url: `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?pageIndex=1&pageSize=1&plat=Wap&deviceid=Wap&product=EFund&version=2.0.0&Fcodes=${code}` },
  { name: 'eastmoney-f10-lsjz', url: `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=1&pageSize=5`, headers: { Referer: 'https://fundf10.eastmoney.com/' } },
]

for (const v of variants) {
  try {
    const res = await fetch(v.url, { headers: v.headers, signal: AbortSignal.timeout(8000) })
    const text = await res.text()
    console.log(`\n===== ${v.name} (HTTP ${res.status}) =====`)
    console.log(text.slice(0, 500))
  } catch (e) {
    console.log(`\n===== ${v.name} ERROR =====`)
    console.log(e.message)
  }
}

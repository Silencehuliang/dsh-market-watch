/** M4 补测:基金排行(mobapi 完整参数)与选股宝。 */
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
  '基金排行 mobapi 完整参数',
  'https://fundmobapi.eastmoney.com/FundRank/List?Sort=3&Page=1&PageSize=5&FundType=0&IsSale=1&plat=Wap&deviceid=Wap&product=EFund&version=6.2.5',
)
await probe('选股宝 flash', 'https://xuangubao.cn/data/flash?limit=5')
await probe('金十金十数据 api', 'https://www.jin10.com/flash_newest.js', {}, 120)

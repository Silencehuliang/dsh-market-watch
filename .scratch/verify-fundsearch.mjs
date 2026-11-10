const q = encodeURIComponent('易方达消费')
const urls = [
  `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${q}`,
  `https://searchapi.eastmoney.com/api/suggest/get?input=${q}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=5`,
]
for (const url of urls) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const text = await res.text()
    console.log(`\n===== ${new URL(url).host} =====`)
    console.log(text.slice(0, 500))
  } catch (e) {
    console.log('ERROR:', e.message)
  }
}

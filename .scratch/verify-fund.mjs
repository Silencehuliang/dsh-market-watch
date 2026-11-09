const code = '110022'
const variants = [
  { name: 'fundgz-https', url: `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}` },
  { name: 'fundgz-http', url: `http://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}` },
  { name: 'fundgz-referer', url: `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`, headers: { Referer: 'https://fund.eastmoney.com/' } },
  { name: 'fundgz-rt-missing', url: `https://fundgz.1234567.com.cn/js/${code}.js` },
  { name: 'eastmoney-api', url: `https://fund.eastmoney.com/pingzhongdata/${code}.js` },
]

for (const v of variants) {
  try {
    const res = await fetch(v.url, { headers: v.headers, signal: AbortSignal.timeout(8000) })
    const buf = await res.arrayBuffer()
    const text = new TextDecoder('utf-8').decode(buf)
    console.log(`\n===== ${v.name} (HTTP ${res.status}) =====`)
    console.log(text.slice(0, 200))
  } catch (e) {
    console.log(`\n===== ${v.name} ERROR =====`)
    console.log(e.message)
  }
}

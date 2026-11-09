// 实测 M1 核心三源:新浪(A股)、天天基金(基金)、腾讯(港股/搜索)
const sources = [
  { name: 'sina-a-stock', url: 'https://hq.sinajs.cn/list=sh600519', headers: { Referer: 'http://finance.sina.com.cn/' } },
  { name: 'tiantian-fund', url: 'https://fundgz.1234567.com.cn/js/110022.js?rt=' + Date.now() },
  { name: 'tencent-hk', url: 'https://qt.gtimg.cn/q=hk00700' },
  { name: 'tencent-search', url: 'https://smartbox.gtimg.cn/s3/?v=2&q=%E8%85%BE%E8%AE%AF&t=all' },
]

for (const s of sources) {
  try {
    const res = await fetch(s.url, { headers: s.headers, signal: AbortSignal.timeout(8000) })
    const buf = await res.arrayBuffer()
    let text
    try {
      text = new TextDecoder('gb18030').decode(buf)
    } catch {
      text = new TextDecoder('utf-8').decode(buf)
    }
    console.log(`\n===== ${s.name} (HTTP ${res.status}) =====`)
    console.log(text.slice(0, 400))
  } catch (e) {
    console.log(`\n===== ${s.name} ERROR =====`)
    console.log(e.message)
  }
}

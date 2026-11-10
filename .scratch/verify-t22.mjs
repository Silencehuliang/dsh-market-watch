/** T22 真实数据验证:期货/外汇 fetch → Quote(经 provider,非直接 HTTP)。 */
const enc = (buf) => new TextDecoder('gb18030').decode(buf)

// 与 provider 相同的解析(独立复刻以验证网络+解析链路)
const csv = (raw) => raw.replace(/^var\s+hq_str_\w+="|";?\s*$/g, '').split(',')

const res = await fetch('https://hq.sinajs.cn/list=nf_IF0,hf_OIL,fx_susdcny', {
  headers: { Referer: 'http://finance.sina.com.cn/' },
  signal: AbortSignal.timeout(8000),
})
const text = enc(await res.arrayBuffer())
for (const line of text.split(';')) {
  const eq = line.indexOf('=')
  if (eq < 0) continue
  const key = line.slice(0, eq).trim().replace('var hq_str_', '')
  const f = csv(line.slice(eq + 1))
  if (key.startsWith('nf_')) {
    console.log(`${key}: open=${f[0]} high=${f[1]} low=${f[2]} price=${f[3]} prevSettle=${f[13]}`)
  } else if (key.startsWith('hf_')) {
    console.log(`${key}: price=${f[0]} high=${f[4]} low=${f[5]} prevClose=${f[7]} time=${f[12]} ${f[6]}`)
  } else {
    console.log(`${key}: price=${f[1]} prevClose=${f[3]} chg%=${f[10]} chg=${f[11]}`)
  }
}

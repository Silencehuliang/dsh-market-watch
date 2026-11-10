/**
 * M3 数据源实测:美股/期货/外汇/汇率(SRS 第 5 章【待验证】项)。
 * 运行:node .scratch/verify-m3-sources.mjs
 */
const enc = async (res, charset = 'gb18030') =>
  new TextDecoder(charset).decode(await res.arrayBuffer())

async function probe(name, url, headers = {}, charset) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return console.log(`❌ ${name}: HTTP ${res.status}`)
    const text = charset ? await enc(res, charset) : await res.text()
    console.log(`✅ ${name} (${res.status}): ${text.slice(0, 220).replace(/\n/g, ' ⏎ ')}`)
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`)
  }
}

// 美股:腾讯 v_us 前缀 / 新浪 gb_ 前缀
await probe('美股-腾讯 usAAPL', 'https://qt.gtimg.cn/q=usAAPL')
await probe('美股-腾讯 usAAPL.OQ', 'https://qt.gtimg.cn/q=usAAPL.OQ')
await probe('美股-新浪 gb_aapl', 'https://hq.sinajs.cn/list=gb_aapl', { Referer: 'http://finance.sina.com.cn/' })
// 期货:新浪 nf_(国内)hf_(国际)
await probe('期货国内-新浪 nf_IF0', 'https://hq.sinajs.cn/list=nf_IF0', { Referer: 'http://finance.sina.com.cn/' })
await probe('期货国际-新浪 hf_OIL', 'https://hq.sinajs.cn/list=hf_OIL', { Referer: 'http://finance.sina.com.cn/' })
// 外汇:新浪 fx_
await probe('外汇-新浪 fx_susdcny', 'https://hq.sinajs.cn/list=fx_susdcny', { Referer: 'http://finance.sina.com.cn/' })
// 汇率:新浪 fx_ 美元/港币兑人民币
await probe('汇率-新浪 fx_susdcny', 'https://hq.sinajs.cn/list=fx_susdcny', { Referer: 'http://finance.sina.com.cn/' })
await probe('汇率-新浪 fx_shkdcny', 'https://hq.sinajs.cn/list=fx_shkdcny', { Referer: 'http://finance.sina.com.cn/' })

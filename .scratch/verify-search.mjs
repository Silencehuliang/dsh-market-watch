const queries = ['腾讯', '易方达', '贵州茅台']
for (const q of queries) {
  const url = `https://smartbox.gtimg.cn/s3/?v=2&q=${encodeURIComponent(q)}&t=all`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  const text = await res.text()
  console.log(`\n===== ${q} =====`)
  console.log(text.slice(0, 600))
}

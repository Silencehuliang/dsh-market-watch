const res = await fetch('https://qt.gtimg.cn/q=hk00700,usAAPL', { signal: AbortSignal.timeout(10000) })
const text = new TextDecoder('gb18030').decode(await res.arrayBuffer())
for (const line of text.split(';').filter((l) => l.includes('='))) {
  const eq = line.indexOf('=')
  const key = line.slice(0, eq).trim()
  const fields = line.slice(eq + 1).replace(/"/g, '').split('~')
  console.log('=== ' + key)
  fields.forEach((x, i) => {
    if (x && x !== '0') console.log(`  [${i}] ${x}`)
  })
}

/** 探测腾讯 K线 API 格式(A股/港股/美股)。 */
const probe = async (param) => {
  const res = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${param},day,,,5,qfq`, {
    signal: AbortSignal.timeout(10000),
  })
  const t = await res.text()
  console.log(`=== ${param} (${res.status})`)
  console.log(t.slice(0, 600))
  console.log()
}
await probe('sh600519')
await probe('hk00700')
await probe('usAAPL')

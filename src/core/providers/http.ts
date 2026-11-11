/**
 * Provider 共享 HTTP 样板(M3 review:三处 fetch+GB18030+parseNum 收敛)。
 */
export const parseNum = (v: string | undefined): number => (v ? Number(v) || 0 : 0)

// ---------- 每主机限频(#35:README 口径 ≤5 req/s;此前声明未实现) ----------

interface LimiterOptions {
  maxPerWindow: number
  windowMs: number
}

const limiterOpts: LimiterOptions = { maxPerWindow: 5, windowMs: 1000 }
const windowStarts = new Map<string, number[]>()

/** 测试专用:重置/自定义限频参数。 */
export function configureRateLimiter(opts?: Partial<LimiterOptions>): void {
  if (opts?.maxPerWindow) limiterOpts.maxPerWindow = opts.maxPerWindow
  if (opts?.windowMs) limiterOpts.windowMs = opts.windowMs
  windowStarts.clear()
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * GET 前按主机排队:滚动窗口内并发启动数不超过 maxPerWindow,超出的等待最早一档过期。
 * 覆盖所有行情 Provider 出站请求(webhook 是用户自有端点,不经此路)。
 */
async function throttledFetch(url: string, init: RequestInit | undefined, timeoutMs: number): Promise<Response> {
  const host = new URL(url).host
  for (;;) {
    const now = Date.now()
    const starts = (windowStarts.get(host) ?? []).filter((t) => now - t < limiterOpts.windowMs)
    if (starts.length < limiterOpts.maxPerWindow) {
      starts.push(now)
      windowStarts.set(host, starts)
      break
    }
    await sleep(starts[0]! + limiterOpts.windowMs - now + 1)
  }
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
}

/** GET + GB18030 解码(新浪/腾讯行情均为 GB18030)。失败抛错,由 QuoteService 兜底。 */
export async function fetchGb18030(
  url: string,
  opts: { referer?: string; timeoutMs?: number } = {},
): Promise<string> {
  const res = await throttledFetch(
    url,
    { headers: opts.referer ? { Referer: opts.referer } : undefined },
    opts.timeoutMs ?? 8000,
  )
  if (!res.ok) throw new Error(`http ${res.status}`)
  return new TextDecoder('gb18030').decode(await res.arrayBuffer())
}

/** JSON GET(东财等,限频同上)。 */
export async function fetchJson<T>(url: string, opts: { referer?: string; timeoutMs?: number } = {}): Promise<T> {
  const res = await throttledFetch(
    url,
    { headers: opts.referer ? { Referer: opts.referer } : undefined },
    opts.timeoutMs ?? 10000,
  )
  if (!res.ok) throw new Error(`http ${res.status}`)
  return (await res.json()) as T
}

/** 文本 GET(金十/腾讯搜索等,限频同上)。 */
export async function fetchText(url: string, opts: { referer?: string; timeoutMs?: number } = {}): Promise<string> {
  const res = await throttledFetch(
    url,
    { headers: opts.referer ? { Referer: opts.referer } : undefined },
    opts.timeoutMs ?? 10000,
  )
  if (!res.ok) throw new Error(`http ${res.status}`)
  return res.text()
}

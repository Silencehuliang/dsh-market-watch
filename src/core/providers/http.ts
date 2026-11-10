/**
 * Provider 共享 HTTP 样板(M3 review:三处 fetch+GB18030+parseNum 收敛)。
 */
export const parseNum = (v: string | undefined): number => (v ? Number(v) || 0 : 0)

/** GET + GB18030 解码(新浪/腾讯行情均为 GB18030)。失败抛错,由 QuoteService 兜底。 */
export async function fetchGb18030(
  url: string,
  opts: { referer?: string; timeoutMs?: number } = {},
): Promise<string> {
  const res = await fetch(url, {
    headers: opts.referer ? { Referer: opts.referer } : undefined,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
  })
  if (!res.ok) throw new Error(`http ${res.status}`)
  return new TextDecoder('gb18030').decode(await res.arrayBuffer())
}

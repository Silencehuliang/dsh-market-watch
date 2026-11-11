import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureRateLimiter, fetchText } from '../src/core/providers/http'

// 限频器走全局 fetch(stub)+ setTimeout(fake timers)
const fetchMock = vi.fn(async () => ({ ok: true, text: async () => 'x', json: async () => ({}) }))
vi.stubGlobal('fetch', fetchMock)

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock.mockClear()
  configureRateLimiter({ maxPerWindow: 2, windowMs: 1000 })
})
afterEach(() => {
  configureRateLimiter() // 恢复默认
  vi.useRealTimers()
})

describe('每主机限频器(#35:README 口径 ≤5 req/s 落地)', () => {
  it('同主机超出的请求等待下一窗口', async () => {
    const pending = [fetchText('https://a.example.com/x'), fetchText('https://a.example.com/y'), fetchText('https://a.example.com/z')]
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock.mock.calls.length).toBe(2) // 前两个立即放行
    await vi.advanceTimersByTimeAsync(1001)
    await Promise.all(pending)
    expect(fetchMock.mock.calls.length).toBe(3) // 第三个在窗口过期后放行
  })

  it('不同主机互不影响', async () => {
    const pending = [fetchText('https://a.example.com/x'), fetchText('https://a.example.com/y'), fetchText('https://b.example.com/x')]
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock.mock.calls.length).toBe(3)
    await Promise.all(pending)
  })

  it('窗口滚动:最早一档过期后继续放行', async () => {
    const first = [fetchText('https://a.example.com/1'), fetchText('https://a.example.com/2')]
    await vi.advanceTimersByTimeAsync(0)
    await Promise.all(first)
    const third = fetchText('https://a.example.com/3')
    await vi.advanceTimersByTimeAsync(1001)
    await third
    expect(fetchMock.mock.calls.length).toBe(3)
  })
})

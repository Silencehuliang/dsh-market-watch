import { describe, expect, it } from 'vitest'
import { crossedThreshold, evaluateRule, isThrottled } from '../src/core/alerts'
import type { AlertRule } from '../src/core/alerts'

const THROTTLE = 180_000 // 3 分钟

describe('crossedThreshold', () => {
  it('上穿:前值 < 阈值,当前 ≥ 阈值 → 触发', () => {
    expect(crossedThreshold(599, 601, 600, 'up')).toBe(true)
  })
  it('未穿越(都在阈值下方)→ 不触发', () => {
    expect(crossedThreshold(599, 599, 600, 'up')).toBe(false)
  })
  it('下穿:前值 > 阈值,当前 ≤ 阈值 → 触发', () => {
    expect(crossedThreshold(601, 599, 600, 'down')).toBe(true)
  })
})

describe('isThrottled', () => {
  it('无上次触发 → 不节流', () => {
    expect(isThrottled(undefined, 1000, THROTTLE)).toBe(false)
  })
  it('3 分钟内再次触发 → 节流', () => {
    expect(isThrottled(1000, 1000 + THROTTLE - 1, THROTTLE)).toBe(true)
  })
  it('达到或超过 3 分钟 → 不节流', () => {
    expect(isThrottled(1000, 1000 + THROTTLE, THROTTLE)).toBe(false)
  })
})

describe('evaluateRule', () => {
  const base: AlertRule = { id: 'r1', kind: 'price', direction: 'up', threshold: 600, enabled: true }
  const OPEN_OPTS = { now: 0, throttleMs: THROTTLE, marketOpen: true }
  const CLOSED_OPTS = { now: 0, throttleMs: THROTTLE, marketOpen: false }

  it('TC-ALT-01 价格上穿 → 触发', () => {
    expect(evaluateRule(base, 599, 601, OPEN_OPTS)).toBe(true)
  })
  it('TC-ALT-02 未穿越 → 不触发', () => {
    expect(evaluateRule(base, 599, 599, OPEN_OPTS)).toBe(false)
  })
  it('TC-ALT-03 3 分钟内第二次穿越 → 不触发(节流)', () => {
    const rule: AlertRule = { ...base, lastTriggeredAt: 1000 }
    expect(evaluateRule(rule, 599, 601, { ...OPEN_OPTS, now: 1000 + THROTTLE - 1 })).toBe(false)
  })
  it('TC-ALT-04 休市 → 不评估', () => {
    expect(evaluateRule(base, 599, 601, CLOSED_OPTS)).toBe(false)
  })
  it('禁用规则 → 不触发', () => {
    expect(evaluateRule({ ...base, enabled: false }, 599, 601, OPEN_OPTS)).toBe(false)
  })
})

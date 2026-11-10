/**
 * 提醒穿越判定与节流(纯函数,零依赖)。
 */

export type AlertKind = 'price' | 'changePercent'
export type AlertDirection = 'up' | 'down'

export interface AlertRule {
  id: string
  kind: AlertKind
  direction: AlertDirection
  threshold: number
  enabled: boolean
  /** 上次触发时间(epoch ms),用于节流。 */
  lastTriggeredAt?: number
}

/** 穿越判定:上穿 = 前值低于阈值且当前达到阈值;下穿反之。 */
export function crossedThreshold(
  prev: number,
  curr: number,
  threshold: number,
  direction: AlertDirection,
): boolean {
  if (direction === 'up') {
    return prev < threshold && curr >= threshold
  }
  return prev > threshold && curr <= threshold
}

/** 节流:距上次触发不足 throttleMs 则视为节流。 */
export function isThrottled(
  lastTriggeredAt: number | undefined,
  now: number,
  throttleMs: number,
): boolean {
  if (lastTriggeredAt === undefined) return false
  return now - lastTriggeredAt < throttleMs
}

export interface EvaluateOptions {
  now: number
  throttleMs: number
  marketOpen: boolean
}

/** 评估一条规则是否触发:需启用、开市、穿越阈值、且未节流。 */
export function evaluateRule(
  rule: AlertRule,
  prev: number,
  curr: number,
  opts: EvaluateOptions,
): boolean {
  if (!rule.enabled) return false
  if (!opts.marketOpen) return false
  if (!crossedThreshold(prev, curr, rule.threshold, rule.direction)) return false
  if (isThrottled(rule.lastTriggeredAt, opts.now, opts.throttleMs)) return false
  return true
}

/**
 * market-watch — 客户端 Remote 贡献。
 * 复用宿主侧 contract.ts 的同一份 invocation 描述符,保证契约不漂移。
 */
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { MARKET_WATCH_INVOCATIONS } from '../remote/contract.js'

export const MARKET_REMOTE: TypertRemoteContribution = {
  package: 'dsh-plugin-market-watch',
  descriptors: MARKET_WATCH_INVOCATIONS,
}

/**
 * market-watch — 宿主 Typert 模型清单。
 * 向模型层描述本插件的 Remote 服务与方法;invocations 与 contract.ts 共享同一份描述符。
 */
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'
import { MARKET_WATCH_INVOCATIONS } from './contract.js'

export const TYPERT_MANIFEST: TypertContribution = {
  package: 'dsh-plugin-market-watch',
  face: 'host',
  schemas: [],
  model: {
    services: [
      {
        key: 'market-watch',
        exportName: 'MarketWatchRuntime',
        description: '盯盘插件数据服务:自选行情、持仓盈亏、设置。',
        tags: [],
        members: [
          {
            kind: 'method',
            name: 'getWatchlist',
            signature: 'getWatchlist(): Promise<WatchlistResult>',
          },
          {
            kind: 'method',
            name: 'getHoldings',
            signature: 'getHoldings(): Promise<HoldingsResult>',
          },
          {
            kind: 'method',
            name: 'getSettings',
            signature: 'getSettings(): Promise<SettingsResult>',
          },
          {
            kind: 'method',
            name: 'search',
            signature: 'search(query: string, signal?: AbortSignal): Promise<SearchResult>',
          },
          {
            kind: 'method',
            name: 'addToWatchlist',
            signature:
              'addToWatchlist(symbol: string, name?: string, signal?: AbortSignal): Promise<OpResult>',
          },
          {
            kind: 'method',
            name: 'removeFromWatchlist',
            signature: 'removeFromWatchlist(symbol: string, signal?: AbortSignal): Promise<OpResult>',
          },
          {
            kind: 'method',
            name: 'setPinned',
            signature: 'setPinned(symbol: string, pinned: boolean, signal?: AbortSignal): Promise<OpResult>',
          },
          {
            kind: 'method',
            name: 'moveToGroup',
            signature:
              'moveToGroup(symbol: string, groupId: string, signal?: AbortSignal): Promise<OpResult>',
          },
          {
            kind: 'method',
            name: 'setSortMode',
            signature: "setSortMode(mode: 'default' | 'asc' | 'desc', signal?: AbortSignal): Promise<OpResult>",
          },
          {
            kind: 'method',
            name: 'createGroup',
            signature: 'createGroup(name: string, signal?: AbortSignal): Promise<OpResult>',
          },
        ],
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
  invocations: MARKET_WATCH_INVOCATIONS,
}

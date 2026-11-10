/**
 * market-watch — 宿主 Remote 服务。
 * TypertRemoteService 把 @Remote 标记的异步方法经 harness Remote 网关暴露给浏览器;
 * 构造函数第二参为客户端挂载用的服务命名空间 key。
 * 数据访问经 MarketWatchDataAccess 注入,便于脱离 cordis/存储单测。
 */
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  holdingsResultSchema,
  settingsResultSchema,
  watchlistResultSchema,
} from './contract.js'
import type { HoldingsResult, SettingsResult, WatchlistResult } from './contract.js'

/** 宿主数据访问面(index.ts 注入真实实现;测试注入 mock)。 */
export interface MarketWatchDataAccess {
  getWatchlistWithQuotes(): Promise<unknown>
  getHoldingsView(): Promise<unknown>
  getSettingsView(): unknown
}

export class MarketWatchRuntime extends TypertRemoteService {
  constructor(ctx: Context, private readonly data: MarketWatchDataAccess) {
    super(ctx, 'market-watch')
  }

  /** 自选 + 最新行情快照(含 stale 标注)。 */
  @Remote
  async getWatchlist(): Promise<WatchlistResult> {
    return watchlistResultSchema.parse(await this.data.getWatchlistWithQuotes())
  }

  /** 持仓 + 盈亏(已按隐私模式过滤)。 */
  @Remote
  async getHoldings(): Promise<HoldingsResult> {
    return holdingsResultSchema.parse(await this.data.getHoldingsView())
  }

  /** 插件设置。 */
  @Remote
  async getSettings(): Promise<SettingsResult> {
    return settingsResultSchema.parse({ settings: this.data.getSettingsView() })
  }
}

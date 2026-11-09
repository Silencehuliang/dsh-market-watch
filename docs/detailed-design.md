# dsh-market-watch 详细设计

> 版本 v0.1 | 2026-11-09 | 上游依据:`架构设计(architecture.md)` 与 `需求说明文档(SRS).md`。本文档给出接口签名、数据结构、状态机与关键时序,可直接指导编码。

## 1. 领域模型

```ts
type Market = 'cn_sh' | 'cn_sz' | 'cn_bj' | 'hk' | 'us' | 'fund' | 'fut_cn' | 'fut_gl' | 'fx'
type SymbolId = `${Market}:${string}`
```

| 类型 | 说明 | 关键字段 |
| --- | --- | --- |
| `Quote` | 股票/期货/外汇行情 | `symbol,name,price,change,changePercent,open,high,low,prevClose,volume,amount,time,status,source,delayedSec,stale?` |
| `FundEstimate` | 基金盘中估值 | `code,name,navDate,nav,estimateNav,estimatePercent,estimateTime,isEstimate,source` |
| `ProviderResult<T>` | Provider 返回包裹 | `data: T; source: string; delayed: boolean; asOf: string` |
| `Holding` | 持仓(见存储 schema) | `shares?,amount?,costPrice?,costNav?,currency?,closed?` |
| `AlertRule` | 提醒规则 | `id,kind, direction, threshold, enabled, lastTriggeredAt?` |
| `MarketStatus` | 市场开收盘 | `market, status, nextOpenAt?` |

`Quote.status` 枚举:`open | closed | pre | post | halt | unknown`。`delayedSec` 表示估值/延迟秒数(基金固定约 120 秒)。

## 2. 数据层详细设计

### 2.1 Provider 接口

```ts
interface Provider<TReq, TRes> {
  id: string
  markets: Market[]            // 自我声明支持的 market
  capabilities: string[]       // 'quote' | 'search' | 'fundEstimate' | 'kline' | ...
  fetch(req: TReq, signal: AbortSignal): Promise<TRes>
}
```

统一错误分类(FR-DATA-05/08):

```ts
type ProviderErrorKind = 'network' | 'parse' | 'rate_limited' | 'no_data' | 'http'
class ProviderError extends Error { kind: ProviderErrorKind; providerId: string }
```

每个 Provider 必带 fixture 用于离线测试(NFR-TEST)。

### 2.2 QuoteService(编排层)

```ts
class QuoteService {
  // 供工具/Remote/提醒使用
  getQuotes(symbols: SymbolId[]): Promise<ProviderResult<Quote>[]>
  searchSymbols(q: string, market?: Market): Promise<Candidate[]>
  getFundEstimates(codes: string[]): Promise<ProviderResult<FundEstimate>[]>
  getMarketStatus(markets?: Market[]): MarketStatus[]
  diagnostics(): ProviderHealth[]
  // 内部
  private tick(): void                       // 一轮轮询
  private shouldPoll(): boolean              // 开市 && (可见UI || 启用提醒)
}
```

**缓存**:`Map<SymbolId, { quote, fetchedAt }>`,有效期 = 轮询间隔;UI/工具/提醒共用同一份缓存(FR-DATA-04)。

**批量合并**:同轮询周期内按 Provider 聚合符号,新浪用逗号拼接;请求数 ≤ ceil(标的数 / 单次批量上限)。

**限频与退避**:每源默认 ≤ 5 req/s;遇 429/403/解析异常指数退避;连续失败进入冷却期(默认 60s,ADR-0001)。

**休市判定**(FR-DATA-06):比较行情返回日期时间戳与当前时间;内置各市场交易时段(A 股 09:30–11:30/13:00–15:00 北京;港股 09:30–12:00/13:00–16:00;美股美东 + 夏令时)。

### 2.3 Symbol 规范化(core/symbol.ts)

- 输入 `sh600519` → `cn_sh:600519`;`hk00700` → `hk:00700`;基金 6 位 → `fund:110022`;期货 `nf_IF0` → `fut_cn:IF0`、`hf_OIL` → `fut_gl:OIL`。
- 反向转换:输出各 Provider 所需前缀(新浪 `sh/sz/bj`、`nf_`/`hf_`、`gb_`/`usr_`;腾讯 `hk`)。
- 非法输入返回明确错误(TC-SYM-09),不抛未捕获异常。

## 3. 存储设计(StorageDomain,域名 `market_watch`,版本 1)

```ts
// 表(Record 按 SymbolId / 按 id keyed)
watchlist: Record<SymbolId, { symbol; name; groupId; pinned; order; addedAt }>
groups:    Record<string, { id; name; order; builtin? }>
holdings:  Record<SymbolId, { shares?; amount?; costPrice?; costNav?; currency?; closed?; updatedAt }>
alerts:    Record<SymbolId, { rules: AlertRule[] }>
// 全局单例
settings: {
  intervalMs: number            // 默认 5000,最小 3000
  riseColor: 'red' | 'green'    // 默认红涨绿跌
  miniBarSymbols: SymbolId[]    // 1~3 个
  labelFormat: string           // 显示模板
  privacy: { exposeAmounts: boolean }   // 默认 false
  enabledMarkets: Market[]
  providerPriority: Record<Market, string[]>  // 源优先级(有备源才填多个)
  alertsEnabled: boolean
  alertThrottleSec: number      // 默认 180
}
```

配置与用户数据分存:设置放 global 单例,其余放表(FR-CFG-02);schema 带版本号(FR-CFG-03)。

- **字段语义(统一 schema)**:`shares` 对股票 = 数量、对基金 = 份额;`costPrice` 为股票成本价,`costNav` 为基金成本净值;`currency` 默认 `CNY`,M3 外币折算依赖它。
- **分组与市场**:`groups.builtin` 的 id 映射 market(如 `builtin:cn_sh`),新增标的按 market 自动落入对应内置分组;用户可移动到自定义分组,自定义分组可跨市场。

## 4. Agent 工具详细设计

通用约定:工具名 snake_case 前缀;`description` 含「数据可能延迟,不构成投资建议」;输出含 `asOf/source/delayed`;只读工具无副作用;列表限制条数并提示截断。

| 工具 | 入参 | 出参(要点) | 副作用 | 隐私 |
| --- | --- | --- | --- | --- |
| `market_search_symbol` | `query, market?` | 候选 `{symbol,name,market,type}[]` | 无 | — |
| `market_quote` | `symbols[]` | `Quote[]` | 无 | — |
| `market_fund_estimate` | `codes[]` | `FundEstimate[]` | 无 | 标 `isEstimate` |
| `market_status` | `markets?` | 各市场状态 + 下次开盘 | 无 | — |
| `market_diagnostics` | 无 | Provider 健康(最近错误/成功/延迟) | 无 | — |
| `watchlist_list` | `group?` | 自选 + 最新行情 | 无 | 金额已隐藏 |
| `watchlist_add/remove` | `symbol, group?` | 结果 | 写(审批待 M0) | — |
| `holdings_get` | 无 | 持仓与盈亏 | 无 | 默认隐藏金额 |
| `holdings_set` | `symbol, shares?, amount?, costPrice?` | 结果 | 写 | — |
| `portfolio_summary` | 无 | 当日/累计盈亏、涨跌分布、最大波动 | 无 | 默认仅百分比 |
| `alert_list/set/delete` | 规则参数 | 结果 | 写 | — |
| `market_kline` | `symbol, range, format` | 日 K(json/csv) | 无 | — |
| `market_fund_history` | `code, range` | 历史净值 | 无 | — |
| `brief_generate` | `kind` | 简报结构化数据 | 无 | — |
| `market_flow` | `kind` | 资金流向 | 无 | — |
| `market_news_flash` | `source?, limit?` | 快讯列表 | 无 | — |

**隐私实现(FR-TOOL-01)**:`privacy.exposeAmounts=false` 时,`holdings_get`/`portfolio_summary` 输出剥离 `shares/amount/costPrice` 字段,只返回百分比与相对权重;`=true` 返回完整值。

> 待补(M4):`market_flow` / `market_news_flash` / `market_fund_rank` 的 Provider 接口细节随对应里程碑补充,当前仅定义工具契约。

## 5. Remote 接口(宿主 → 浏览器)

```ts
class MarketService {
  @Remote('snapshot') snapshot(): { watchlist; quotes; holdings; settings }
  @Remote('search') search(q: string): Candidate[]
  @Remote('setHolding') setHolding(symbol, holding): void
  @Remote('setAlert') setAlert(symbol, rule): void
  @Remote('setSetting') setSetting(patch): void
  @Remote('diagnostics') diagnostics(): ProviderHealth[]
}
```

每轮轮询结束后广播无 payload 变更事件(`market/changed`),浏览器侧收到后调 `snapshot` 重拉(沿用 dsh schedule 的变更通知模式,SRS 8.4)。

## 6. 提醒引擎(core/alerts.ts)

```ts
type AlertKind = 'price' | 'percent'
type AlertDirection = 'up' | 'down'
interface AlertRule { id; kind; direction; threshold; enabled; lastTriggeredAt? }
```

- **穿越判定**(纯函数):维护「上一值 prev」,当 `prev < threshold && curr >= threshold`(上穿)或 `prev > threshold && curr <= threshold`(下穿)时触发。
- **节流**:同一标的同一规则 3 分钟内最多一次(`alertThrottleSec`)。
- **评估时机**:宿主侧轮询周期内,不依赖 UI 是否打开;仅开市评估(FR-ALERT-02)。
- **通知可达性(关键,列 M0 首项验证)**:提醒在宿主侧触发、不依赖 UI 打开,但 `shell.overlay` 是浏览器侧组件。M0 先验证 dsh 是否有宿主侧全局通知:有则用全局通知;无则降级为「未读提醒计数 + UI 下次可见时批量补发」。通知含标的、触发条件、当前价、时间,可「删除该规则」「关闭全部提醒」(FR-ALERT-04)。
- **禁用 `ctx.schedule` 做轮询**(FR-ALERT-05):schedule 每次触发会向会话投递提醒并驱动模型回合,既贵又慢。

## 7. 简报模块

- `brief_generate(kind)` 聚合 `market_status → watchlist_list → portfolio_summary → market_news_flash` 的结构化数据,由模型整理成文(FR-BRIEF-01/03)。
- 休市日 `market_status` 明确返回「休市」,模型直接回复「今日休市」(FR-BRIEF-02)。
- 盘前:隔夜外盘、快讯、自选关注点;盘后:当日自选涨跌排行、持仓盈亏、资金流向摘要。内容必须基于工具数据,缺口声明。

> 待验证(M3):`ctx.schedule` 向「原会话」投递,会话关闭后是否仍触发,归入 M3 验证。

## 8. 关键流程时序

### 8.1 轮询(QuoteService.tick)

1. 汇总标的 = 自选 ∪ 提醒标的 ∪ 迷你条标的。
2. 过滤出当前开市标的(首载时休市标的也请求一次)。
3. 按 Provider 批量请求 → 写入缓存。
4. 广播 `market/changed` → 评估提醒 → 触发通知。
5. 不在每轮写存储(避免 IO 放大)。
6. 暂停条件:无可见 UI 且无启用提醒,或全市场休市。

### 8.2 工具调用

```
模型 → dsh 运行时 → 工具 execute()
     → 参数校验(zod) → QuoteService.getQuotes()/存储读写
     → 隐私过滤 → 组装 {data, asOf, source, delayed} → 结构化 JSON + 文本
```

### 8.3 提醒触发

```
tick → 行情更新 → alerts.evaluate(prev, curr, rules)
     → 命中穿越 + 未节流 → AlertEngine.notify() → shell.overlay 通知
```

### 8.4 UI 刷新

```
tick 结束 → 广播 market/changed(无 payload)
         → 浏览器侧订阅回调 → MarketService.snapshot() → React 状态更新
UI 更新节流 ≤ 1 次/秒;页面不可见时暂停刷新(FR-UI-07)
```

## 9. 错误处理与可诊断

- 每个 Provider 记录最近错误(kind + 时间)、最近成功时间、延迟统计,经 `market_diagnostics` 与设置页查看(FR-DATA-08)。
- 网络/代理失败给出可读提示(「请检查代理设置」),对齐韭菜盒子常见问题。
- 全部失败 → 返回缓存数据 + 标注「已过期」(NFR-REL 优雅降级)。
- 未捕获异常统一捕获并分级记录(NFR-OBS:error/warn/info/debug,默认 info)。

## 10. 隐私与安全实现

- 出站请求域名白名单:默认仅内置 Provider 域名,设置页可见(NFR-SEC)。
- 不读 dsh 凭据/API Key;不访问与行情无关的宿主能力。
- 日志脱敏:不打印持仓金额与 Webhook 地址。
- 无遥测、无 eval、依赖锁定版本、不引入带安装脚本的依赖。
- 持仓/提醒/Webhook 仅本地存储;任何情况下不上传第三方(模型上下文除外,受隐私模式控制,NFR-PRIV)。

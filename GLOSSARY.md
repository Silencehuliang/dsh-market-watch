# dsh-market-watch

把 VSCode 插件「韭菜盒子」(leek-fund)的盯盘能力做成 DeepSeek Harness(dsh)插件,并利用 dsh 的 Agent 能力做出差异化。本术语表是领域概念的单一来源,与 SRS 第 2 章一致。

## Language

### 平台

**dsh**:
DeepSeek Harness,Agent 运行时,基于 Cordis 插件框架。
_Avoid_: 宿主框架、平台(除非指 dsh 本身)

**Host / 宿主**:
dsh 的 Node 进程,插件的服务端部分运行在这里。
_Avoid_: 服务端、后端

**Client / 浏览器侧**:
dsh 的 Web 界面(桌面版内嵌),插件的 UI 部分运行在这里。
_Avoid_: 前端、客户端

**Slot**:
Web Client 的 UI 插槽,插件通过 `ctx.slots.register()` 贡献组件。

**Remote**:
宿主服务暴露给浏览器侧调用的方法。
_Avoid_: RPC、API

**Storage Domain**:
dsh 的领域 KV 存储,用 zod 声明 schema。

### 行情与持仓

**标的**:
用户关注或持仓的对象(股票、基金、期货、外汇),内部统一用 `{market}:{code}` 标识。
_Avoid_: 证券、品种、代码

**市场(Market)**:
标的所属的交易所/资产类别,取 `cn_sh`/`cn_sz`/`cn_bj`/`hk`/`us`/`fund`/`fut_cn`/`fut_gl`/`fx`。

**自选**:
用户关注的标的列表。
_Avoid_: 关注列表、watchlist(除非指工具名)

**持仓**:
用户为标的录入的份额/金额/成本,用于计算盈亏。
_Avoid_: 仓位、头寸

**估值**:
基金盘中的估算净值,不是官方净值。

**盘中 / 近实时**:
行情为交易时段内的盘中数据,可能延迟(基金估值约 2 分钟),非官方收盘数据。
_Avoid_: 实时

**分组**:
自选标的的归类;内置分组按 market 映射,也支持自定义分组。

### 数据层

**Provider**:
单一数据源的适配器(请求 + 解析 + 错误分类)。
_Avoid_: 数据源(指第三方站点本身时可用)

**QuoteService**:
行情编排层,负责轮询、批量合并、缓存、限频、冷却期、休市判定。

**源健康监控**:
跟踪每个 Provider 的最近错误/成功/延迟,供 `market_diagnostics` 与设置页查看。

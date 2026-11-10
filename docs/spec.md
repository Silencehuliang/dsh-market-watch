## Problem Statement

开发者在使用 DeepSeek Harness(dsh)编码时,无法低打扰地查看行情与持仓,而 dsh 生态现有插件(dsh-plugin-astock / dsh-plugin-aportfolio / dsh-fund-research)未覆盖:基金盘中估值、港股/美股/期货/外汇、常驻行情面板、价格提醒、定时简报。

## Solution

做一个 dsh 插件 `dsh-plugin-market-watch`,提供核心看盘体验(自选行情常驻、持仓盈亏、涨跌提醒、详情走势),并把同一份行情数据同时做成 Agent 可调用的工具,利用 dsh 自带的 Agent 能力做差异化(自然语言问自选、定时盘前盘后简报、模型解读快讯)。数据层采用「单源可靠 + 缓存兜底 + 源健康监控」以降低免费接口失效的影响。

## User Stories

1. As a 开发者型散户, I want 在 dsh 右侧栏常驻看到自选行情, so that 写代码时能瞟一眼涨跌而不被打断。
2. As a 开发者型散户, I want 按名称或代码模糊搜索并添加标的, so that 快速把关心的股票/基金加入自选。
3. As a 开发者型散户, I want 对自选分组(默认按市场 + 自定义), so that 按资产类别整理标的。
4. As a 开发者型散户, I want 对自选排序与置顶, so that 优先看到关心的标的。
5. As a 投资者, I want 为标的录入持仓(基金份额/金额、股票成本/数量/清仓), so that 自动计算盈亏与收益率。
6. As a 投资者, I want 看到当日盈亏、累计盈亏与收益率, so that 了解持仓表现。
7. As a 投资者, I want 外币标的按汇率折算为人民币, so that 港股/美股持仓盈亏可比。
8. As a 投资者, I want 设置价格/涨跌幅穿越提醒, so that 达到阈值时收到通知而非一直盯盘。
9. As a 投资者, I want 提醒在开市时自动评估且不依赖 UI 打开, so that 不打开面板也能收到提醒。
10. As a 投资者, I want 提醒按 3 分钟节流, so that 不被同一标的反复打扰。
11. As a 开发者型散户, I want 一个常驻迷你条显示 1~3 个标的与总盈亏, so that 不用打开面板也能看到行情。
12. As a 开发者型散户, I want 点击标的进入详情(分时/日K/基金走势/历史净值/持仓/提醒), so that 深入了解单个标的。
13. As an Agent 用户, I want 用自然语言问「我的自选怎么样」, so that 让模型替我整理行情而非自己看。
14. As an Agent 用户, I want 用自然语言查询行情/估值/市场状态, so that 把行情作为对话的一部分。
15. As an Agent 用户, I want 定时盘前/盘后简报, so that 自动获得开盘前/收盘后的市场概览。
16. As an Agent 用户, I want 模型解读快讯与个股, so that 获得信息整理而非原始数据。
17. As a 隐私敏感用户, I want 默认不把持仓金额暴露给模型, so that 云端上下文不含敏感金额。
18. As a 用户, I want 设置轮询间隔/涨跌颜色/显示模板/启用的市场/数据源优先级, so that 按自己偏好定制。
19. As a 用户, I want 导入导出自选/持仓/提醒/设置, so that 跨环境迁移。
20. As a 用户, I want 中英文界面并跟随深浅色主题, so that 不同语言/主题偏好可用。
21. As a 用户, I want 数据源失效时有明确提示(已过期/估值/已收盘), so that 不被延迟数据误导。
22. As a 用户, I want 数据源诊断信息(最近错误/延迟), so that 排查代理/接口问题。

## Implementation Decisions

- **插件形态**:宿主(Node)+ 浏览器(Client)双侧 bundle;网络请求只在宿主侧,浏览器侧只渲染并与宿主通信。
- **可靠性模型**:单源可靠 + 缓存兜底 + 源健康监控(ADR-0001),仅对有第二免费源的场景(如 A 股)配 Provider 优先级回退。
- **隐私边界**:默认只隐藏金额/份额/成本价,不隐藏自选标的名单(ADR-0002)。
- **标的规范化**:内部统一 `{market}:{code}`,与各数据源代码双向转换(FR-DATA-01)。
- **持仓模型**:统一 schema,`shares` 对股票=数量/基金=份额,`costPrice`/`costNav` 区分成本,`currency` 默认 CNY(M3 外币折算依赖)。
- **分组**:内置分组 id 映射 market,新增标的自定落入内置分组,自定义分组可跨市场。
- **Agent 工具**:17 个,按领域前缀 market_/watchlist_/holdings_/alert_/brief_,输出含 asOf/source/delayed。
- **提醒**:宿主侧定时器驱动,禁用 ctx.schedule 轮询;穿越判定 + 3 分钟节流;通知可达性列 M0 验证。
- **公式**:盈亏/收益率/份额反推按 SRS 附录 B。
- **图表**:零依赖 SVG 自绘。
- **涨跌颜色**:riseColor 单开关(红涨绿跌可反转)。
- **术语/决策**:根 GLOSSARY.md + docs/adr/ 为单一来源。

## Testing Decisions

- **接缝(seam)**:Provider 接口是唯一 mock 接缝(网络边界);所有第三方请求收敛于此,测试用 fixture Provider 替换,CI 不联网。
- **纯函数层零接缝**:symbol/portfolio/alerts/calendar 零依赖,直接单测。
- **测试原则**:只测外部行为,不测实现细节;核心逻辑行覆盖率 ≥ 80%(NFR-TEST)。
- **用例来源**:SRS 第 10 章测试用例表(TC-SYM/TC-FB/TC-CAL/TC-PARSE/TC-PL/TC-PRIV/TC-ALT)。
- **测试框架**:vitest。

## Out of Scope

- 交易下单、券商账户接入、量化回测。
- 买卖建议、荐股、收益承诺。
- 付费/Pro 体系、云端账号与云同步。
- 数字货币(币安)视图、移动端。
- 雪球新闻(需 cookie token,首版不做)。

## Further Notes

- 数据来自公开网页接口,可能延迟、不准确或随时失效;README/设置页/工具描述需含免责声明。
- 交付分里程碑:M0 验证 → M1 数据层与工具 → M2 界面 → M3 提醒/简报/多市场 → M4 增强。
- 数据源先验证 M1 核心三源:新浪(A股)/天天基金(基金)/腾讯(港股/搜索)。

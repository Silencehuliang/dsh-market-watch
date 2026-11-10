# Changelog

本项目的所有显著变更将记录在本文件。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),版本遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 计划中

- 桌面版(Electron)npm 安装链路实测
- 2027 年 A 股节假日表更新

### Fixed(全面评审 + 实机测试发现,均含回归测试)

- **期货/外汇行情实机不可用**:`fetchFuturesFxQuotes` 切行 body 携带前导引号未被剥离,首字段解析 NaN,所有 nf_/hf_ 行情被静默丢弃;`csv()` 兼容完整行与切行两种形态
- **美股行情实机不可用**:搜索产出含交易所后缀的 `us:AAPL.OQ`,而 `qt.gtimg.cn` 只认无后缀代码(`usAAPL.OQ` → `pv_none_match`);`toTencentCodes` 现剥离 `.OQ/.N/.A` 后缀(类股分隔点如 `BRK.B` 保留)
- **外汇行情实机不可用**:新浪 `fx_` 代码大小写敏感(`fx_SUSDCNY` 返回空数据),`toProviderCode`/期货外汇 Provider 统一小写输出
- **迷你条点击无法打开面板**:客户端调用不存在的 Remote 方法 `ackAlerts`,异常吞掉后 `open()` 不执行、「查看即清未读」从未生效;补全 Remote 契约(runtime/contract/typert/dataAccess)并改为先开面板、ack 异步
- **K 线详情空数据崩溃**:空 bars 时取色表达式先行求值 `bars[-1].close` 抛 TypeError;增加显式空态(`kline.empty`,中英文案)
- **(#32)`market_export` 默认脱敏**:此前无视隐私模式整体 dump 持仓金额与 webhook 地址进模型上下文;现默认脱敏(持仓只含结构字段、settings 去 webhook 地址),显式 `full=true` 才完整导出(ADR-0002 修订)
- **(#33)holdings 契约字段**:`currency`/`fxRate`/`fxMissing` 此前被 remote schema 静默剥离,汇率缺失降级标注与币种标注到不了 UI;schema 补字段,币种在隐私模式也下发;迷你条外币成本未按汇率折算致总收益率失真一并修复(与 portfolio_summary 同口径),汇率缺失显示 `≈` 提示
- **(#34)北向资金口径**:`market_flow(kind=north)` 此前返回恒为 0 的净流入(2024-08 起停止披露),误导;现返回 `unavailable: true` + 当日总成交额(唯一仍披露口径),新增 `kind=south` 南向港股通净买入(买−卖,不信任数据源占位净额字段)

### Changed

- 测试:新增离线集成测试(真实 `apply(ctx)` 全链路 33 例)、Remote 契约测试、实机测试套件(`MW_LIVE=1 npx vitest run tests/live`,24 例);单测 120 → 190+
- 文档:README/README.en 与实测对齐(工具数 26、可靠性口径改为 60s 冷却、北向资金口径失效、`market_export` 隐私例外、搜索裸代码说明);评审未修复项见 issues #32–#38

## [0.1.0] - 2026-11-10

首个公开版本。里程碑 M0–M4 全部交付,实机验证记录见 `docs/verification.md`。

### Added

- **数据层(M1)**:A 股(新浪)/ 基金估值(东方财富,`fundgz` 已下架后切换)/ 港股·美股(腾讯)Provider;`{market}:{code}` 标的规范化;QuoteService 统一轮询、批量合并、缓存、限频(≤5 req/s)、冷却期与休市判定;单源可靠 + 缓存兜底(ADR-0001)
- **Agent 工具(25 个)**:`market_quote`(含盘口一档 bid1/ask1 与委比)、`market_fund_estimate`、`market_search`、`market_kline`(前复权,json/csv)、`market_fund_history`、`market_flow`(北向/行业/概念)、`market_news_flash`、`market_fund_rank`、`market_status`(开收盘状态与下次开盘时间)、`market_diagnostics`(数据源健康:错误/延迟/冷却期)、`market_export`/`market_import`(带版本号)、`market_watch_hello`;`watchlist_add/list/remove`;`holdings_set/get`(隐私模式过滤);`alert_set/list/delete/ack`;`brief_generate/brief_schedule`;`share_card`
- **界面(M2)**:右侧栏行情 tab(分组/三态排序/置顶/行内 K 线详情)、常驻迷你条(1~3 标的 + 总盈亏)、设置区;页面不可见自动暂停轮询、恢复即刷(FR-UI-07);零依赖 SVG 图表
- **提醒(M3)**:宿主侧 5 秒定时器评估引擎——仅开市时段评估、3 分钟节流、穿越判定、未读角标;可选 Webhook 推送(默认关闭,地址仅本地存储)
- **简报(M3)**:`brief_schedule` 每日盘前 09:15 / 盘后 15:10(Asia/Shanghai);休市日按 A 股交易日历自动跳过;盘后简报含持仓盈亏
- **多市场与外币(M3)**:期货(国内/国际)、外汇行情;港股/美股持仓按汇率折算人民币(汇率缓存 5 分钟)
- **增强(M4)**:板块/北向资金流、金十快讯、基金排行、SVG 收益分享卡片(金额强制隐藏)
- **隐私(ADR-0002)**:默认隐藏金额/份额/成本,自选名单不隐藏;敏感金额不进入模型上下文
- **测试**:120 个用例(vitest);Provider 全 fixture 化,CI 不联网;纯函数层零依赖直接单测

[Unreleased]: https://github.com/Silencehuliang/dsh-market-watch/compare/0.1.0...HEAD
[0.1.0]: https://github.com/Silencehuliang/dsh-market-watch/releases/tag/0.1.0

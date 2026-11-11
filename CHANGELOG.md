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
- **(#35)每主机限频 ≤5 req/s + 指数退避**:原宣称未实现;现所有 Provider 出站请求经共享限频器排队,QuoteService 失败冷却按 2^n 指数退避(429/403 加倍,封顶 16×基准),成功清零;诊断输出补 `consecutiveFailures`
- **(#36)输入校验**:`market_quote` 改返回 `{quotes, missing}`(未知标的不再静默消失);`market_status` 未知市场明确报错(此前误报 open);`market_fund_estimate/history` 校验 6 位数字基金码
- **(#37)迷你条总收益率 / 分组 / 定时幂等**:组合总收益率改宿主侧按内部金额计算(百分比-only,默认隐私模式同样显示,README 已知限制移除);`watchlist_add` 自定义分组不存在时自动创建;`brief_schedule` 同 kind 同时间幂等,改时间标注 previousTime;提醒基线残留随规则删除清理
- **杂项**:轮询瞬态失败不再整面板替换列表(顶部提示保留数据);国内期货时间戳改北京时间(此前误用 UTC);移除死代码 `serviceFor`

### Changed

- **(#38)测试基建**:m4/kline 的 fetch+parse 全部拆为纯函数(parseSectorFlow/parseNewsFlashText/parseFundRankText/parseKlineResponse/parseFundHistory)+ fixture 单测;新增 client DOM smoke 测试(jsdom + testing-library,覆盖迷你条渲染/点击链路与 K 线空态);新增限频器单测;离线集成(真实 `apply(ctx)` 全链路)/Remote 契约/实机(`MW_LIVE=1 npx vitest run tests/live`)三套齐备,用例 120 → 215+
- 文档:README/README.en 与实测对齐(工具数 26、北向口径、导出脱敏、限频与退避口径、搜索裸代码说明)

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

# Changelog

本项目的所有显著变更将记录在本文件。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),版本遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 计划中

- 桌面版(Electron)npm 安装链路实测
- SRS 规划的 `market_status` / `market_diagnostics` 诊断工具
- 2027 年 A 股节假日表更新

## [0.1.0] - 2026-11-10

首个公开版本。里程碑 M0–M4 全部交付,实机验证记录见 `docs/verification.md`。

### Added

- **数据层(M1)**:A 股(新浪)/ 基金估值(东方财富,`fundgz` 已下架后切换)/ 港股·美股(腾讯)Provider;`{market}:{code}` 标的规范化;QuoteService 统一轮询、批量合并、缓存、限频(≤5 req/s)、冷却期与休市判定;单源可靠 + 缓存兜底(ADR-0001)
- **Agent 工具(23 个)**:`market_quote`(含盘口一档 bid1/ask1 与委比)、`market_fund_estimate`、`market_search`、`market_kline`(前复权,json/csv)、`market_fund_history`、`market_flow`(北向/行业/概念)、`market_news_flash`、`market_fund_rank`、`market_export`/`market_import`(带版本号)、`market_watch_hello`;`watchlist_add/list/remove`;`holdings_set/get`(隐私模式过滤);`alert_set/list/delete/ack`;`brief_generate/brief_schedule`;`share_card`
- **界面(M2)**:右侧栏行情 tab(分组/三态排序/置顶/行内 K 线详情)、常驻迷你条(1~3 标的 + 总盈亏)、设置区;页面不可见自动暂停轮询、恢复即刷(FR-UI-07);零依赖 SVG 图表
- **提醒(M3)**:宿主侧 5 秒定时器评估引擎——仅开市时段评估、3 分钟节流、穿越判定、未读角标;可选 Webhook 推送(默认关闭,地址仅本地存储)
- **简报(M3)**:`brief_schedule` 每日盘前 09:15 / 盘后 15:10(Asia/Shanghai);休市日按 A 股交易日历自动跳过;盘后简报含持仓盈亏
- **多市场与外币(M3)**:期货(国内/国际)、外汇行情;港股/美股持仓按汇率折算人民币(汇率缓存 5 分钟)
- **增强(M4)**:板块/北向资金流、金十快讯、基金排行、SVG 收益分享卡片(金额强制隐藏)
- **隐私(ADR-0002)**:默认隐藏金额/份额/成本,自选名单不隐藏;敏感金额不进入模型上下文
- **测试**:120 个用例(vitest);Provider 全 fixture 化,CI 不联网;纯函数层零依赖直接单测

[Unreleased]: https://github.com/Silencehuliang/dsh-market-watch/compare/0.1.0...HEAD
[0.1.0]: https://github.com/Silencehuliang/dsh-market-watch/releases/tag/0.1.0

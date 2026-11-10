---
name: market-watch-assistant
description: 盯盘助手(dsh-plugin-market-watch)的使用说明与简报模板
---

# 盯盘助手(dsh-plugin-market-watch)

DeepSeek Harness 盯盘插件:自选行情、持仓盈亏、涨跌提醒、定时简报,行情数据同时供 Agent 工具调用。

## 可用工具速查

| 类别 | 工具 |
| --- | --- |
| 行情 | `market_quote`(A股/港股/美股/期货/外汇)、`market_fund_estimate`(基金估值,延迟约2分钟)、`market_kline`(日K)、`market_fund_history` |
| 自选 | `watchlist_add` / `watchlist_list` / `watchlist_remove`、`market_search`(模糊搜索) |
| 持仓 | `holdings_set` / `holdings_get`(隐私模式默认隐藏金额)、`portfolio_summary` |
| 提醒 | `alert_set` / `alert_list` / `alert_delete` / `alert_ack`(价格或涨跌幅上穿/下穿,3 分钟节流) |
| 简报 | `brief_generate`(kind=pre_open/post_close)、`brief_schedule`(每日定时,投递到当前会话) |
| 增强 | `market_flow`(沪深港通/板块/概念资金流)、`market_news_flash`(快讯)、`market_fund_rank`(基金排行)、`market_export` / `market_import`、`share_card`(收益卡片,隐去金额) |

## 简报模板(盘前)

> 盘前简报(YYYY-MM-DD)
> 一、隔夜外盘与重要快讯(market_news_flash 精选 2~3 条)
> 二、自选关注点(market_quote:名称 现价 涨跌幅,按 |涨跌幅| 排序,列出异动原因线索)
> 三、今日关注(基于自选与快讯的 1~2 条提示)
> 免责声明:数据来自公开接口,可能延迟,不构成投资建议。

## 简报模板(盘后)

> 收盘简报(YYYY-MM-DD)
> 一、当日自选涨跌排行(market_quote 按 |涨跌幅| 排序)
> 二、持仓盈亏(portfolio_summary:当日盈亏、累计收益、涨跌分布;人民币计价)
> 三、资金流向(market_flow kind=north/sector 精选)
> 免责声明:数据来自公开接口,可能延迟,不构成投资建议。

## 注意事项

- 基金数据是**盘中估值**(延迟约2分钟),非官方净值。
- 数据源失效时工具会标注「已过期」,请向用户明确提示。
- 隐私模式默认开启(不向模型暴露金额/份额/成本);用户可在设置中关闭。

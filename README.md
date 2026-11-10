# dsh-market-watch

DeepSeek Harness(dsh)盯盘插件:自选行情常驻侧栏、持仓盈亏、涨跌提醒、定时简报,同一份行情数据同时以 Agent 工具形式暴露给模型——**Agent 替你先看一遍,而不是你让 Agent 看**。

数据来自公开网页接口(新浪 A 股 / 腾讯港股美股 / 东方财富基金),不构成投资建议。

## 功能特性

- **常驻行情侧栏**:自选分组(A 股 / 港股 / 美股 / 其他)实时列表,迷你条显示 1~3 个标的与总盈亏;页面不可见时自动暂停轮询(FR-UI-07)
- **多市场行情**:A 股、港股、美股、场内基金、期货(国内/国际)、外汇;A 股/港股/美股含盘口一档(bid1/ask1)与委比
- **持仓账本**:录入份额/成本,自动计算当日盈亏、累计盈亏与收益率;港股/美股按汇率折算为人民币
- **涨跌提醒**:价格/涨跌幅穿越阈值触发,开市时才评估、同一规则 3 分钟节流;可选 Webhook 推送(默认关闭)
- **定时简报**:`brief_schedule` 每日盘前/盘后自动生成组合简报;休市日自动跳过
- **零依赖图表**:K 线 / 基金走势 / 份额卡片全部 SVG 自绘,不引入图表库

## 安装

```bash
# dsh Web 版(CLI,注意必须带 --profile)
dsh plugin --profile web add dsh-plugin-market-watch

# 桌面版:插件管理页输入 npm 包名 dsh-plugin-market-watch
```

### 兼容版本

| 组件 | 要求 | 实测 |
| --- | --- | --- |
| Node | >= 22 | 22.19+ |
| dsh CLI | `0.2.1-rc.3`(engines 声明) | `0.2.1-rc.3` |
| dsh 桌面版 | 插件管理页 npm 安装 | 待发布后实测 |

## Agent 工具(23 个)

输出统一含 `asOf` / `source` / `delayed` 标注,延迟数据不冒充实时效。

| 前缀 | 工具 | 说明 |
| --- | --- | --- |
| market_ | `market_quote` | 批量行情;A股/港股/美股含盘口一档与委比(orderBookRatio,%) |
| | `market_fund_estimate` | 基金盘中估值(延迟约 2 分钟,强制标注) |
| | `market_search` | 名称/代码模糊搜索(跨市场) |
| | `market_kline` / `market_fund_history` | 日 K(前复权)/ 基金历史净值 |
| | `market_flow` / `market_news_flash` / `market_fund_rank` | 板块资金流向 / 市场快讯 / 基金排行 |
| | `market_export` / `market_import` | 自选/持仓/提醒/设置 带版本号导出导入 |
| | `market_watch_hello` | 插件自检 |
| watchlist_ | `watchlist_add` / `watchlist_list` / `watchlist_remove` | 自选增删查(幂等) |
| holdings_ | `holdings_set` / `holdings_get` | 持仓录入与查询(含盈亏,受隐私模式限制) |
| alert_ | `alert_set` / `alert_list` / `alert_delete` / `alert_ack` | 提醒规则 CRUD 与未读清除 |
| brief_ | `brief_generate` / `brief_schedule` | 手动简报 / 每日定时简报(ctx.schedule) |
| — | `share_card` | 分享卡片 SVG(金额字段强制隐藏) |

## 配置项

侧栏设置区可改,对话内改设置同样生效:

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| 轮询间隔 `intervalMs` | 5000ms | 3~60 秒;页面不可见自动暂停 |
| 涨跌颜色 `riseColor` | 红涨绿跌 | 可反转为绿涨红跌 |
| 隐私模式 `privacy.exposeAmounts` | 关闭 | 关闭时持仓金额/份额/成本不进入模型上下文 |
| 排序 `sortMode` | 原顺序 | 原顺序(含置顶)/涨跌幅升序/降序 三态循环 |
| 提醒开关 `alertsEnabled` | 开启 | 宿主侧定时器驱动,不依赖 UI 打开 |
| Webhook 推送 `webhookUrl` | 空 | 非空才推送;地址视为敏感信息仅本地存储 |

## 隐私边界

默认**只隐藏金额/份额/成本价,不隐藏自选标的名单**(ADR-0002):开启隐私模式后,Agent 查询持仓只返回百分比与方向,敏感金额不进入任何模型上下文。`share_card` 的金额字段无论何种设置都强制隐藏。

## 免责声明

本项目数据来自公开网页接口,**可能延迟、不准确或随时失效**,仅供个人参考,不构成任何投资建议;据此交易风险自负。作者不对数据质量与接口可用性作任何保证。

## 已知限制

- 免费接口无 SLA:新浪/腾讯/东财接口可能限频或改版;主源失败时用缓存兜底并标注 `stale`
- 基金盘中估值延迟约 2 分钟,且为估算值而非官方净值
- 交易日历为内置固定节假日表(2026 年),每年需手动更新;期货/外汇分组归入「其他」
- 天天基金 `fundgz` 估值接口已下架,基金估值改用东方财富方案
- 桌面版(Electron)安装需发布 npm 包后实测;桌面 profile 由应用内置管理,CLI 不直接操作

## 开发

```bash
npm install
npm test          # vitest,120 个用例,CI 不联网(Provider 全部 fixture 化)
npm run build     # esbuild bundle + tsc

# 本地加载到 dsh web(无需发布)
dsh --profile web --patch ./cordis.patch.yml
```

架构与设计文档见 `docs/`(spec / SRS / detailed-design / ADR),术语表见根目录 `GLOSSARY.md`。

盈亏计算公式参考 [leek-fund](https://github.com/Leek-Fund/leek-fund)(BSD-3-Clause)。

## License

MIT

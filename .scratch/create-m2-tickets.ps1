$repo = "Silencehuliang/dsh-market-watch"

gh issue create --repo $repo --title 'T11: 宿主 Remote 数据服务' --label 'ready-for-agent' --body @'
## Parent

Part of #1 (M2)

## What to build

宿主侧 MarketWatchService(Typert Remote Service):暴露 getWatchlistQuotes()(自选+行情快照)、getHoldings()、getSettings() 等 Remote 方法;typert 清单注册(ctx.typert.register),使浏览器侧可 ctx.remote.$mount 并调用。对齐官方 dsh-plugin-template 的 GreetRuntime 模式。这是 M2 所有 UI 票的数据通道地基。

## Acceptance criteria

- [ ] MarketWatchService 注册为 cordis 服务,Remote 方法暴露 quotes/watchlist/holdings/settings
- [ ] typert 清单注册,build 后 dsh --dump-config 无报错
- [ ] 宿主侧单测覆盖服务逻辑(数据组装/隐私过滤)

## Blocked by

None (can start immediately)
'@

gh issue create --repo $repo --title 'T12: 侧栏行情 tab 最小页' --label 'ready-for-agent' --body @'
## Parent

Part of #1 (M2)

## What to build

浏览器侧 sidebarRightTabs 注册自定义 tab(kind: market),tab body 挂载 T11 的 Remote,渲染分组自选列表(名称、代码、现价、涨跌幅,涨跌色红涨绿跌);会话页头动作按钮(slot conversation.session.header.actions)一键打开(FR-UI-01);stale 数据标注「已过期」。

## Acceptance criteria

- [ ] dsh web 界面右侧出现「行情」tab,一键入口可打开
- [ ] 列表显示真实自选+行情数据(经 Remote 从宿主获取)
- [ ] 涨跌色正确;stale 数据标注过期

## Blocked by

- #12 (T11)
'@

gh issue create --repo $repo --title 'T13: 交易日历接入(FR-DATA-07)' --label 'ready-for-agent' --body @'
## Parent

Part of #1 (M2)

## What to build

calendar.ts 扩展:内置 A 股节假日表(含调休,每年手动更新)+ 市场时区转换(Intl),提供顶层 isMarketOpen(market, now) 判定;接入宿主轮询:节假日/休市不发起高频轮询;Quote.status 由日历填充(open/closed/...)。

## Acceptance criteria

- [ ] 单测:节假日、调休补班、各市场开收盘判定(TC-CAL 扩展)
- [ ] 轮询在节假日不发起高频请求(诊断可证)
- [ ] Quote.status 由日历填充

## Blocked by

None (can start immediately)
'@

gh issue create --repo $repo --title 'T14: 搜索添加端到端(FR-WL-02 / FR-UI-03)' --label 'ready-for-agent' --body @'
## Parent

Part of #1 (M2)

## What to build

腾讯搜索 Provider(smartbox.gtimg.cn/s3/,M0 已实测)+ market_search 工具(候选:代码/名称/市场/类型);UI「添加」按钮打开搜索框 → 候选列表 → 点击添加进自选;列表行内删除。

## Acceptance criteria

- [ ] market_search 搜「腾讯」返回 hk00700 等候选(真实数据验证)
- [ ] UI 添加框搜索 → 添加 → 列表即时出现
- [ ] 行内删除可用

## Blocked by

- #13 (T12)
'@

gh issue create --repo $repo --title 'T15: 分组/排序/置顶端到端(FR-WL-03 / FR-WL-04)' --label 'ready-for-agent' --body @'
## Parent

Part of #1 (M2)

## What to build

groups 表(自定义分组 CRUD,内置分组按 market 归类)、watchlist_move(改分组)/排序方式(三态循环:原顺序含置顶/涨跌幅升序/降序)、置顶项始终组首;UI:分组折叠、排序切换。

## Acceptance criteria

- [ ] 自定义分组增删,标的可移动分组
- [ ] 三态排序循环正确,置顶始终组首
- [ ] UI 分组可折叠

## Blocked by

- #13 (T12)
'@

gh issue create --repo $repo --title 'T16: 迷你条端到端(FR-UI-02)' --label 'ready-for-agent' --body @'
## Parent

Part of #1 (M2)

## What to build

常驻迷你条 UI:M0 实测候选位置(composer.dock / shell.overlay)选定挂载点,显示 1-3 个选定标的 + 总盈亏,单行,点击打开侧栏行情页;支持设置迷你条标的。无合适挂载点时记录降级方案。

## Acceptance criteria

- [ ] 迷你条显示选定标的实时行情与总盈亏
- [ ] 点击打开行情 tab
- [ ] 若无合适挂载点,降级结论写入 verification.md

## Blocked by

- #13 (T12)
'@

gh issue create --repo $repo --title 'T17: 设置端到端(FR-UI-05 / FR-CFG-03)' --label 'ready-for-agent' --body @'
## Parent

Part of #1 (M2)

## What to build

侧栏内设置区:轮询间隔(3-60 秒)、涨跌色反转、隐私模式开关、提醒开关、迷你条标的;存储 schema 带版本号(FR-CFG-03);配置改动即时生效。

## Acceptance criteria

- [ ] 设置可修改并持久化(重启保留)
- [ ] 涨跌色反转与轮询间隔即时生效
- [ ] schema 带版本,非法配置不崩溃

## Blocked by

- #13 (T12)
'@

gh issue create --repo $repo --title 'T18: UI 质量收尾(FR-UI-07 / 08 / 09 / 06)' --label 'ready-for-agent' --body @'
## Parent

Part of #1 (M2)

## What to build

FR-UI-07 页面不可见暂停刷新 + UI 节流(每秒最多 1 次);FR-UI-08 深浅色主题跟随 + ctx.locale 中英文字典;FR-UI-09 空状态(无自选/数据源失败/休市/已过期);FR-UI-06 显示模板占位符。

## Acceptance criteria

- [ ] tab 隐藏时暂停刷新,恢复继续;节流生效
- [ ] 深浅色主题无样式错乱;中英文可切换
- [ ] 无自选/数据源失败有明确空态提示

## Blocked by

- #13 (T12)
'@

gh issue create --repo $repo --title 'T19: P1 收尾:portfolio_summary + 导入导出' --label 'ready-for-agent' --body @'
## Parent

Part of #1 (M2)

## What to build

portfolio_summary 工具(当日盈亏、累计盈亏、涨跌分布、最大波动标的,受隐私模式限制);export/import 工具(自选/分组/持仓/提醒/设置导出 JSON 并导入,带版本号校验,FR-WL-07)。

## Acceptance criteria

- [ ] portfolio_summary 输出汇总(隐私模式下不含金额)
- [ ] 导出 JSON 可再导入,版本不符明确报错

## Blocked by

- #12 (T11)
'@

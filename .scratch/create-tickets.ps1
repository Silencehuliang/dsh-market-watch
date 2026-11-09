$repo = "Silencehuliang/dsh-market-watch"

# T1 -> #2
gh issue create --repo $repo --title "T1: 标的规范化(symbol)" --label "ready-for-agent" --body @'
## Parent

Part of #1

## What to build

内部统一用 `{market}:{code}` 标识标的,提供与各数据源代码(sh/sz/bj、hk、gb_/usr_、nf_/hf_、基金 6 位)的双向转换;非法输入返回明确错误。

## Acceptance criteria

- [ ] TC-SYM-01~09 单测通过(normalizeSymbol / toProviderCode 双向转换)
- [ ] 非法输入抛 SymbolError,不产生未捕获异常

## Blocked by

None (can start immediately)
'@

# T2 -> #3
gh issue create --repo $repo --title "T2: 盈亏计算(portfolio)" --label "ready-for-agent" --body @'
## Parent

Part of #1

## What to build

份额反推、当日盈亏、累计盈亏、收益率纯函数,公式对齐 leek-fund 源码(附录 B)。

## Acceptance criteria

- [ ] TC-PL-01~07 单测通过(份额反推/当日盈亏/累计盈亏/收益率/收盘保持/清仓)
- [ ] 纯函数零依赖,可独立单测

## Blocked by

None (can start immediately)
'@

# T3 -> #4
gh issue create --repo $repo --title "T3: 提醒穿越判定+节流(alerts)" --label "ready-for-agent" --body @'
## Parent

Part of #1

## What to build

价格/涨跌幅穿越判定(上穿/下穿)+ 3 分钟节流。

## Acceptance criteria

- [ ] TC-ALT-01~04 单测通过(穿越触发/未穿越/节流/休市不评估)
- [ ] 纯函数零依赖,可独立单测

## Blocked by

None (can start immediately)
'@

# T4 -> #5
gh issue create --repo $repo --title "T4: 休市判定(calendar)" --label "ready-for-agent" --body @'
## Parent

Part of #1

## What to build

各市场开收盘/休市/节假日/美股夏令时判定。

## Acceptance criteria

- [ ] TC-CAL-01~05 单测通过(周末/午休/收盘后/节假日/美股夏令时)

## Blocked by

None (can start immediately)
'@

# T5 -> #6
gh issue create --repo $repo --title "T5: 插件最小骨架(M0 验证)" --label "ready-for-agent" --body @'
## Parent

Part of #1

## What to build

hello 工具 + sidebar tab + storage 读写 + Remote,可 `--patch` 加载宿主+浏览器双侧插件。

## Acceptance criteria

- [ ] 能用 --patch 在 dsh web 加载双侧插件
- [ ] 打包后可在桌面版插件管理页安装(记录版本)
- [ ] Sidebar tab 能打开并显示宿主 Remote 数据
- [ ] 迷你条候选位置实测结论、通知组件选型、数据推送方案、写工具审批、数据源实测样例
- [ ] 结论写入 docs/verification.md

## Blocked by

None (can start immediately)
'@

# T6 -> #7
gh issue create --repo $repo --title "T6: A股行情端到端" --label "ready-for-agent" --body @'
## Parent

Part of #1

## What to build

新浪 provider → quote-service → market_quote 工具:查询 A 股返回 Quote,主源失败时返回缓存并标注「已过期」。

## Acceptance criteria

- [ ] 调 market_quote 返回 A 股 Quote(含 source/asOf/delayed)
- [ ] 主源失败返回缓存并标注 stale
- [ ] fixture Provider 离线测试,CI 不联网

## Blocked by

- #2 (T1)
- #6 (T5)
'@

# T7 -> #8
gh issue create --repo $repo --title "T7: 基金估值端到端" --label "ready-for-agent" --body @'
## Parent

Part of #1

## What to build

天天基金 provider → market_fund_estimate 工具:返回基金盘中估值。

## Acceptance criteria

- [ ] 调 market_fund_estimate 返回 FundEstimate,标 isEstimate
- [ ] 估值延迟约 2 分钟,delayed 字段正确
- [ ] fixture 离线测试

## Blocked by

- #2 (T1)
- #6 (T5)
'@

# T8 -> #9
gh issue create --repo $repo --title "T8: 自选管理端到端" --label "ready-for-agent" --body @'
## Parent

Part of #1

## What to build

watchlist_add / watchlist_list / watchlist_remove 工具 + storage:增删查自选,幂等去重。

## Acceptance criteria

- [ ] 增删查自选,重复添加幂等
- [ ] 分组(内置按 market 归类 + 自定义)
- [ ] 持久化到 storageDomain

## Blocked by

- #2 (T1)
- #6 (T5)
'@

# T9 -> #10
gh issue create --repo $repo --title "T9: 持仓盈亏端到端" --label "ready-for-agent" --body @'
## Parent

Part of #1

## What to build

holdings_set / holdings_get 工具 + portfolio + 隐私过滤:设持仓、算盈亏、默认隐藏金额。

## Acceptance criteria

- [ ] 设持仓(基金份额/金额、股票成本/数量/清仓)
- [ ] 盈亏计算对齐附录 B 公式
- [ ] privacy.exposeAmounts=false 时输出不含金额/份额/成本价

## Blocked by

- #2 (T1)
- #3 (T2)
- #6 (T5)
'@

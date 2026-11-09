# 开发票据(Tickets)

> 按 Matt Pocock 工作流拆分:每张票是**可独立演示的垂直切片**,内部走 TDD(red → green → refactor)。上游:规范文档(SRS/architecture/detailed-design)。

## 批次 A:纯函数地基(零依赖,立即 TDD)

> 不依赖 dsh 环境,可直接用第 10 章测试用例表驱动。是 M1 的地基。

| 票 | 模块 | 测试用例 | 验收 |
| --- | --- | --- | --- |
| T1 | `core/symbol.ts` 标的规范化 | TC-SYM-01~09 | `normalizeSymbol`/`toProviderCode` 双向转换正确,非法输入抛 `SymbolError` |
| T2 | `core/portfolio.ts` 盈亏计算 | TC-PL-01~07 | 份额反推/当日盈亏/累计盈亏/收益率按附录 B 公式,纯函数 |
| T3 | `core/alerts.ts` 提醒穿越判定+节流 | TC-ALT-01~04 | 穿越判定正确,3 分钟节流生效,休市不评估 |
| T4 | `core/calendar.ts` 休市判定 | TC-CAL-01~05 | 周末/午休/收盘后/节假日/美股夏令时判定正确 |

## 批次 B:M0 验证(依赖 dsh 环境)

| 票 | 内容 | 验收 |
| --- | --- | --- |
| T5 | 插件最小骨架:hello 工具 + sidebar tab + storage 读写 + Remote + `--patch` 加载 | SRS M0 清单 8 项验证,结论写 `docs/verification.md` |

## 批次 C:M1 端到端垂直切片(数据源 + 工具)

> 每票横跨 provider → quote-service → 工具,可独立演示「用户可感知」的功能。

| 票 | 垂直切片 | 验收 |
| --- | --- | --- |
| T6 | A 股行情端到端:新浪 provider → quote-service → `market_quote` | 查询 A 股返回 Quote,缓存/兜底生效 |
| T7 | 基金估值端到端:天天基金 provider → `market_fund_estimate` | 返回估值,标 `isEstimate` |
| T8 | 自选管理端到端:`watchlist_add/list/remove` + storage | 增删查自选,幂等去重 |
| T9 | 持仓与盈亏端到端:`holdings_set/get` + portfolio + 隐私过滤 | 设持仓、算盈亏、默认隐藏金额 |

## 执行约定

- 每票先写**一个失败测试**描述最小行为 → 运行确认失败(red)→ 写最小实现使其通过(green)→ 重构成交(refactor)。
- 批次 A 全部通过后,进入批次 B(M0 验证);批次 B 打通 dsh 集成后,进入批次 C。
- 数据源验证(批次 C 前置):先验新浪(A 股)/天天基金(基金)/腾讯(港股/搜索)三源,结果写 `docs/verification.md`。

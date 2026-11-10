/**
 * 创建 M3 票据(#21-#27)。node 全程 UTF-8,经 stdin 传给 gh api,避免 PowerShell GBK 坑。
 */
import { execSync } from 'node:child_process'

const REPO = 'repos/Silencehuliang/dsh-market-watch/issues'

const tickets = [
  {
    title: 'T20: M3 数据源实测(美股/期货/外汇/汇率)',
    body: `## Parent

Part of #1 (M3)

## What to build

实测 SRS 第 5 章全部【待验证】数据源,结论写入 docs/verification.md 并回填 SRS 5.1:

- 美股:腾讯 \`qt.gtimg.cn/q=usAAPL\` 与新浪 \`gb_\` 前缀(二选一或都用)
- 期货:国内 \`nf_IF0\`、国际 \`hf_OIL\`(新浪)
- 外汇:\`fx_susdcny\`(新浪)
- 汇率源:美元/港币兑人民币(FR-WL-06 外币折算依赖)
- 各市场字段映射(名称/现价/昨收/涨跌幅/时间)

## Acceptance criteria

- [ ] 每个市场至少一个可用源,字段映射写入 verification.md
- [ ] 汇率源确定(USD/CNY、HKD/CNY)
- [ ] SRS 5.1 表格回填实测结论

## Blocked by

None (can start immediately)`,
  },
  {
    title: 'T21: 港股/美股行情端到端',
    body: `## Parent

Part of #1 (M3)

## What to build

腾讯港股/美股 Provider(T20 结论的源)+ fixture 单测;market_quote 路由扩展 hk/us;watchlist_add 支持外币标的;UI 外币标的显示(币种标注)。

## Acceptance criteria

- [ ] market_quote 查 hk00700 / us 美股返回真实 Quote
- [ ] fixture 离线测试(CI 不联网)
- [ ] watchlist_add 外币标的入对应分组

## Blocked by

- #21 (T20)`,
  },
  {
    title: 'T22: 期货/外汇行情端到端',
    body: `## Parent

Part of #1 (M3)

## What to build

新浪期货(国内 nf_/国际 hf_)与外汇(fx_)Provider + fixture 单测;market_quote 路由扩展 fut_cn/fut_gl/fx。

## Acceptance criteria

- [ ] market_quote 查期货/外汇返回真实 Quote
- [ ] fixture 离线测试
- [ ] 休市判定(期货/外汇交易时段)按 T20 实测结论

## Blocked by

- #21 (T20)`,
  },
  {
    title: 'T23: 汇率折算(外币持仓折人民币)',
    body: `## Parent

Part of #1 (M3)

## What to build

汇率 Provider(T20 结论)+ FR-WL-06 外币折算:holdings_get / portfolio_summary 对 currency≠CNY 的持仓按汇率折算人民币计价;holdings 表 currency 字段(已预留)接线;UI 币种显示。

## Acceptance criteria

- [ ] 外币持仓的市值/盈亏以人民币计价输出
- [ ] 汇率获取失败时明确标注(降级不崩)
- [ ] 单测覆盖折算纯函数

## Blocked by

- #21 (T20)`,
  },
  {
    title: 'T24: 提醒端到端(规则 CRUD + 评估引擎 + 通知)',
    body: `## Parent

Part of #1 (M3)

## What to build

- alerts 存储表 + alert_list/set/delete 三个工具(规则:价格上穿/下穿、涨跌幅上穿/下穿,FR-ALERT-01)
- 宿主侧定时器评估引擎(**禁止用 dsh schedule 做轮询**,FR-ALERT-05):接入 evaluateRule 纯函数(T3 已就绪),仅在开市时评估(FR-ALERT-02),3 分钟节流(FR-ALERT-03)
- 通知:shell.overlay 提示(含标的/条件/当前价/时间,可删除该规则/关闭全部);无 UI 可见时的降级方案(未读计数,FR-ALERT-04)——M0 遗留的可达性验证在此完成
- alertsEnabled 设置接线

## Acceptance criteria

- [ ] 规则 CRUD 持久化,重启保留
- [ ] 价格穿越触发通知,3 分钟内不重复
- [ ] 休市不评估;无 UI 打开时仍触发(或降级机制可证)
- [ ] 引擎逻辑单测(节流/穿越/休市)

## Blocked by

None (can start immediately)`,
  },
  {
    title: 'T25: 定时简报(盘前/盘后)',
    body: `## Parent

Part of #1 (M3)

## What to build

- brief_generate 工具(盘前:隔夜外盘/自选关注点;盘后:当日自选涨跌排行/持仓盈亏;内容基于工具数据,缺口声明,FR-BRIEF)
- ctx.schedule 注册盘前/盘后简报(交易日历跳过休市日,M3 验收「休市日简报返回休市」)
- schedule 生命周期验证:会话关闭后是否仍触发(M3 验收项,结论写 verification.md)

## Acceptance criteria

- [ ] brief_generate 输出结构化简报数据
- [ ] 休市日简报返回「休市」
- [ ] schedule 触发与生命周期验证结论

## Blocked by

None (交易日历 T13 已就绪)`,
  },
  {
    title: 'T26: P1 日K + 基金历史净值 + 详情页',
    body: `## Parent

Part of #1 (M3)

## What to build

- market_kline 工具(前复权日K,区间 1w/1m/3m/6m/1y,json 或紧凑 csv,FR-DATA-10)
- market_fund_history 工具(东财 f10/lsjz,已实测,FR-DATA-10)
- 详情页(FR-UI-04,P1):点击标的行进入二级视图——基本行情、日K(零依赖 SVG 自绘)、基金历史净值、该标的的提醒与持仓

## Acceptance criteria

- [ ] 两个工具真实数据验证,输出长度与区间匹配
- [ ] 详情页在 tab 内二级视图可用,可返回列表
- [ ] K 线 SVG 自绘,无大型图表库依赖

## Blocked by

- #22 (T21)`,
  },
]

for (const t of tickets) {
  execSync(`gh api ${REPO} -X POST --input -`, {
    input: JSON.stringify({ title: t.title, body: t.body, labels: ['ready-for-agent'] }),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'inherit'],
  })
  console.log(`created: ${t.title}`)
}

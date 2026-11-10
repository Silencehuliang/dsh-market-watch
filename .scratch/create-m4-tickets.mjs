/**
 * 创建 M4 票据(#28-#31)。node UTF-8 + gh api stdin(避编码坑)。
 */
import { execSync } from 'node:child_process'

const REPO = 'repos/Silencehuliang/dsh-market-watch/issues'

const tickets = [
  {
    title: 'T27: M4 数据源实测(资金流向/快讯/基金排行)',
    body: `## Parent

Part of #1 (M4)

## What to build

实测 M4 三个工具的数据源(SRS 标【待验证】的接口),结论写入 verification.md 并回填 SRS:

- 资金流向(FR-DATA-11):东方财富 push2 接口(沪深港通/北向/南向、板块与概念资金流,单位亿)
- 快讯(FR-NEWS-01):选股宝、金十快讯接口
- 基金排行:东方财富基金排行接口

## Acceptance criteria

- [ ] 每个能力至少一个可用源,字段映射入 verification.md
- [ ] SRS 5.1 回填

## Blocked by

None`,
  },
  {
    title: 'T28: market_flow 资金流向工具(FR-DATA-11)',
    body: `## Parent

Part of #1 (M4)

## What to build

market_flow 工具(kind=north/south/sector/concept):沪深港通、北向、南向资金,板块与概念资金流向(单位亿);fixture 离线测试。

## Acceptance criteria

- [ ] 四种 kind 均可查询,真实数据验证
- [ ] fixture 离线测试
- [ ] M4 待补的 Provider 细节落盘(审查遗留项)

## Blocked by

- #28 (T27)`,
  },
  {
    title: 'T29: market_news_flash + market_fund_rank 工具(FR-NEWS-01)',
    body: `## Parent

Part of #1 (M4)

## What to build

- market_news_flash(source 选股宝/金十,limit 与关键词过滤,缓存≤60s,FR-NEWS-01)
- market_fund_rank(type/period,FR-DATA-10 关联)
- fixture 离线测试

## Acceptance criteria

- [ ] 快讯按时间倒序 + limit + 关键词过滤
- [ ] 基金排行真实数据验证
- [ ] 缓存不超过 60 秒

## Blocked by

- #28 (T27)`,
  },
  {
    title: 'T30: P2 收尾(收益分享图 + Webhook 提醒 + dsh Skill)',
    body: `## Parent

Part of #1 (M4)

## What to build

- FR-WL-08 收益分享图:生成收益卡片(默认隐去金额只显示百分比;基于持仓盈亏数据)
- FR-ALERT-06 Webhook:可选推送提醒到企业微信/钉钉/飞书机器人(默认关闭;地址仅本地存储)
- FR-BRIEF-04 Skill:附带 dsh Skill 说明「盯盘助手」用法与简报模板

## Acceptance criteria

- [ ] 收益卡片默认隐去金额
- [ ] Webhook 默认关闭,开启后提醒可推送(或明确记录未验证项)
- [ ] Skill 文件随包分发

## Blocked by

None(P2,可与前置票并行)`,
  },
]

for (const t of tickets) {
  execSync(`gh api ${REPO} -X POST --input -`, {
    input: JSON.stringify({ title: t.title, body: t.body, labels: ['ready-for-agent'] }),
    encoding: 'utf8',
  })
  console.log(`created: ${t.title}`)
}

# dsh-market-watch 架构设计

> 版本 v0.1 | 2026-11-09 | 上游依据:`需求说明文档(SRS).md`(已评审定稿)。本文档回答"系统由哪些部分组成、彼此如何连接、依赖方向如何",是详细设计的骨架。

## 1. 架构目标与原则

| 原则 | 来源 | 落地含义 |
| --- | --- | --- |
| 一份数据层,三出口 | SRS G2 / 8.1 | 行情/基金/自选/持仓/提醒的数据逻辑只实现一次,同时服务 UI、Agent 工具、提醒引擎 |
| 单源可靠 + 缓存兜底 | ADR-0001 | 不空写多源适配器;可靠性靠缓存、冷却期、源健康监控 |
| 双侧 bundle、各司其职 | SRS 3.2 | 网络请求只在宿主(Node)侧;浏览器侧只渲染 + 与宿主通信 |
| 数据而非结论 | SRS FR-TOOL-02 | 工具只返回数据与计算,不产出投资建议 |
| 隐私默认关闭金额 | ADR-0002 | 进入模型上下文的输出默认隐藏金额/份额/成本 |
| 纯函数优先 | SRS NFR-TEST | 规范化、盈亏、提醒、休市判定等核心逻辑为纯函数,可单测 |
| 失败不影响宿主 | SRS NFR-REL | 任何 Provider 失败不拖垮 dsh 主流程 |

## 2. 总体架构

```text
                          ┌────────────────────────── 浏览器侧(Client) ──────────────────────────┐
                          │  Sidebar Tab(行情)   迷你条(MiniBar)   设置(Settings)   详情(Detail)   │
                          │        │                  │                 │               │         │
                          │        └────────── ctx.slots / ctx.sidebarRightTabs 注册 ─┘         │
                          └────────────────────────────────┬─────────────────────────────────────┘
                                                           │ Remote 方法调用 + 变更事件订阅
                          ┌────────────────────────────────┴─────────────────────────────────────┐
                          │                         宿主侧(Node / Host)                           │
                          │                                                                       │
                          │   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐           │
                          │   │  Agent 工具层   │   │  Remote 服务层  │   │  AlertEngine  │           │
                          │   │  market_* 等    │   │  MarketService │   │  提醒评估+节流  │           │
                          │   └───────┬───────┘   └───────┬───────┘   └───────┬───────┘           │
                          │           │                   │                   │                   │
                          │   ┌───────┴───────────────────┴───────────────────┴───────┐           │
                          │   │                     QuoteService(核心编排)            │           │
                          │   │   轮询 · 批量合并 · 缓存 · 限频 · 冷却期 · 休市判定      │           │
                          │   └───────┬───────────────────────────────────────┬───────┘           │
                          │           │                                       │                   │
                          │   ┌───────┴───────┐                       ┌───────┴───────┐           │
                          │   │  Providers     │                       │  StorageDomain │           │
                          │   │ sina/tencent/  │                       │  market_watch  │           │
                          │   │ tiantian/...   │                       │ (zod schema)   │           │
                          │   └───────┬───────┘                       └───────────────┘           │
                          │           │                                                           │
                          └───────────┼───────────────────────────────────────────────────────────┘
                                      ▼ 出站网络(仅宿主侧,域名白名单)
                          外部免费数据源(新浪 / 腾讯 / 天天基金 / 东方财富 ...)
```

**核心不变量**:浏览器侧不直接发任何第三方网络请求;所有行情数据经 `QuoteService` 统一缓存后,由 Remote 快照方法或变更事件送达 UI。

## 3. 运行时拓扑与生命周期

- 宿主侧 `apply(ctx)` 是唯一装配入口:注册工具、存储域、定时器、Remote 方法、事件订阅,全部收进 `ctx.effect(...)` 并返回释放函数(NFR-PERF:卸载时清理)。
- `apply()` 不发网络请求;轮询延迟到「首次有可见 UI 或启用提醒」时启动(SRS NFR-PERF)。
- 浏览器侧通过 `dsh.client` 清单加载,`apply(ctx)` 里注册 slot 与侧栏 tab,启动后订阅宿主变更事件。

## 4. 模块划分与职责

### 4.1 宿主侧(src/)

| 模块 | 路径 | 职责 | 依赖 |
| --- | --- | --- | --- |
| 装配 | `index.ts` | `apply(ctx)`:装配全部模块,管理生命周期 | 所有 |
| 标的规范化 | `core/symbol.ts` | `{market}:{code}` 与各数据源代码双向转换(纯函数) | 无 |
| Provider 适配器 | `core/providers/*` | 单一数据源的请求 + 解析 + 错误分类 | 网络层 |
| 行情编排 | `core/quote-service.ts` | 轮询、批量合并、缓存、限频、冷却期、休市判定 | providers, symbol, calendar |
| 交易日历 | `core/calendar.ts` | 内置节假日表 + 行情时间戳纠正 | 无(数据表) |
| 盈亏计算 | `core/portfolio.ts` | 盈亏/收益率/份额反推(纯函数) | 无 |
| 提醒评估 | `core/alerts.ts` | 穿越判定 + 节流(纯函数核心) | portfolio |
| 存储 | `storage.ts` | `defineDomain(...)` 定义 schema 与表 | zod |
| 工具 | `tools/*` | 各 Agent 工具定义(只调 QuoteService/存储) | quote-service, storage |
| Remote | `remote.ts` | 暴露给浏览器侧的宿主方法 | quote-service, storage |
| 简报 | `brief.ts` | 简报所需结构化数据聚合(供工具调用) | tools |

### 4.2 浏览器侧(src/client/)

| 模块 | 职责 |
| --- | --- |
| `index.tsx` | 注册 slot 与 sidebarRightTabs、订阅变更事件 |
| `WatchTab.tsx` | 行情侧栏页(自选列表、分组、排序、涨跌) |
| `MiniBar.tsx` | 常驻迷你条(1~3 标的 + 总盈亏) |
| `Detail.tsx` | 详情二级视图(K 线/走势/持仓/提醒) |
| `Settings.tsx` | 设置页(轮询间隔、颜色、隐私、数据源) |

## 5. 依赖方向与分层规则

```text
工具层 / Remote层 / 提醒引擎
        │  只能向下依赖
        ▼
QuoteService(编排层)—— 不依赖工具层/UI
        │
        ▼
Providers · StorageDomain · Calendar
        │
        ▼
纯函数模块(symbol / portfolio / alerts)—— 零依赖,禁止 import 任何 dsh 运行时
```

- **纯函数层(symbol/portfolio/alerts)不得 import dsh 或任何 Provider**,保证可独立单测。
- **Providers 不互相调用**;备源回退由 `QuoteService` 编排,不内嵌在 Provider。
- **浏览器侧与宿主侧共享类型定义**(`Quote`、`FundEstimate` 等),但**不共享运行时实现**;类型放在 `src/shared/types.ts` 供双侧引用。
- 新增 Provider 不修改业务代码(FR-DATA-02):Provider 实现统一接口并自我声明 `markets` 与 `capabilities`。

## 6. 关键架构决策

| 决策 | 结论 | 记录 |
| --- | --- | --- |
| 可靠性模型 | 单源 + 缓存兜底 + 源健康监控 | ADR-0001 |
| 隐私边界 | 只挡金额,不挡标的名单 | ADR-0002 |
| 推送方案 | 默认 Remote + 无 payload 变更事件;若自定义资源协议在 M0 验证可行则升级 | SRS 8.4(待 M0 定) |
| 提醒轮询 | 宿主侧定时器驱动,禁用 `ctx.schedule`(每次触发会驱动模型回合) | SRS FR-ALERT-05 |
| 图表 | 零依赖 SVG 自绘,不引入大型图表库 | SRS FR-UI-04 |
| 网络 | Node 全局 `fetch` + `AbortSignal.timeout`,依赖最小化 | SRS 8.7 |

## 7. 打包与集成

- `package.json`:`name = dsh-plugin-market-watch`;声明 `dsh.bundle.patch`(指向 `cordis.patch.yml`)与 `dsh.client`;`exports` 同时导出宿主入口与 `./client`;声明宿主版本范围 `>=0.1.7-rc.1 <0.3.0`。
- 浏览器侧产物遵循官方 lazy-CJS factory bundle 约定(SRS 3.2,【待验证】)。
- 安装:`dsh plugin --profile web add dsh-plugin-market-watch`;桌面版在插件管理页输入包名。

## 8. 架构风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| 免费接口随时失效/改版 | 行情不可用 | 缓存兜底 + 冷却期 + `market_diagnostics` 可诊断 + fixture 测试 |
| 浏览器侧布局仅存内存、刷新即折叠 | 入口消失 | 显眼一键打开入口(会话页头动作) + README 说明(SRS FR-UI-01) |
| 工具结果进云端,隐私泄露 | 用户持仓泄露 | 隐私模式默认关金额(ADR-0002);出站域名白名单 |
| dsh 权限隔离缺口(插件可读 API Key) | 安全 | 主动收窄能力,不读凭据;README 声明(SRS NFR-SEC) |
| 轮询成本 | 资源/限频 | 开市 + 有可见 UI 或启用提醒时才高频;否则降频/暂停 |

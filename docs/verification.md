# 验证记录(verification.md)

> 记录【待验证】项的实测结论,以及本文档与官方行为的差异。实测对象:dsh CLI `@deepseek-ai/dsh` **0.2.1-rc.3**(全局安装于 `E:\Development\Env\nodejs\node_modules\@deepseek-ai\dsh`),Node v24.22.2。

## 1. 环境

- dsh CLI 已安装:`dsh --version` → `0.2.1-rc.3`。
- 本地调试无需 dsh 源码仓库:`dsh --profile web --patch ./cordis.yml` 用 patch 文件加载本地插件。
- 本地安装:`dsh plugin --profile <name> add .`(转发给 pnpm)。
- 桌面版(DeepSeek Harness.exe)是 Electron 应用;profile 名 `desktop` 被保留给 Electron,CLI 拒绝直接操作,需经桌面版内置命令管理。

## 2. 插件 API 实测(对照 SRS §3.3)

| 能力 | SRS 调研 | 实测(v0.2.1) | 结论 |
| --- | --- | --- | --- |
| 插件形态 | `apply(ctx)` + `export const inject` | `export function apply(ctx, config)` + `export const inject: string[]` + `export const name`;清理用 `ctx.effect(fn, label)` | ✅ 一致 |
| 工具 | `ctx.tools.register(defineTool(...))` | 同;`defineTool({name, description, parameters, output:{schema,render}, execute})`,`inject=['tools']` | ✅ 一致 |
| 浏览器 UI | `ctx.slots.register()` / `ctx.slots.inject(key, cb)` | `ctx.slots.register(spec, Component)` / `entries` / `subscribe` / `provideRoot`;**无 `inject()` 顶层方法**(`inject` 是 SlotMap 中每个 slot 的声明字段) | ⚠️ 差异:无 `ctx.slots.inject()` |
| 侧栏 tab | `ctx.sidebarRightTabs.register(...)` | `ctx.sidebarRightTabs.register({id, kind, title, ...})`,body 注册到 `sidebar.right.pane.tab` keyed slot | ✅ 一致 |
| 存储域 | `ctx.storageDomain.open(defineDomain(...))` | `ctx.storageDomain.open(defineDomain({name, version, tables}))`,表用 `domainTable(zodSchema)`,读写 `table.get/put/update` | ✅ 一致(zod) |
| Remote | `@Remote('list')` 暴露 | Typert 协议:宿主 `Service extends TypertRemoteService`,`@Remote(...)` 装饰方法;浏览器侧 `ctx.remote` | ✅ 一致 |
| 定时 | `ctx.schedule`(cron/daily/weekly/every) | `ctx.timer`(interval/timeout/throttle/debounce)+ `ctx.schedule`(`create({cron|daily|weekly|every_seconds|at|after_seconds})`) | ✅ 一致 |
| 打包 | lazy-CJS factory bundle | 客户端 bundle 为 `window.__ModuleLoader__.load({id, factory:(require)=>module.exports})`;`package.json` 声明 `dsh.client.{inject,platform}` + `exports` 导出 `.`(宿主)与 `./client`(浏览器) | ⚠️ 细节:`__ModuleLoader__` 而非 `dsh.bundle.patch` |

## 3. 与 SRS 的差异记录

1. **`ctx.slots.inject()` 不存在**:SRS §3.3 写的 `ctx.slots.inject(key, cb)` 在 v0.2.1 是 `ctx.slots.register(spec, Component)`;「inject」是 slot 的声明字段。UI 贡献统一走 `register`。
2. **打包字段**:`dsh.bundle.patch`(指向 cordis.patch.yml)**存在**(经官方 dsh-plugin-template 确认);配合 `dsh.client.{inject, platform}` + `engines.dsh`。
3. **客户端 bundle 构建约定**(经官方 dsh-plugin-template/build.mjs 确认):用 **esbuild** 双构建——宿主 `esm/node22`(外部化 `@deepseek-ai/*`),客户端 `cjs/browser`(外部化 react 全家 + `@deepseek-ai/*`),再用 **banner/footer 注入** `window.__ModuleLoader__.load({ id, factory: (require) => { var module={exports:{}}; ... return module.exports; } })` 包装。声明文件由 tsc `emitDeclarationOnly` 单独产出。本仓库 `build.mjs` 已复刻此约定,dist/client.js 验证格式正确。
4. **版本**:SRS 调研桌面版 v0.2,CLI 兼容 `>=0.1.7-rc.1 <0.3.0`;实测 CLI 0.2.1-rc.3,`engines.dsh` 精确声明。

## 4. cordis.patch.yml 格式

```yaml
- id: market-watch
  name: /absolute/path/to/dist/index.js   # 本地宿主入口
```

`--patch` 层叠加顺序:`dsh.profile.bundles` → profile 自身 `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → `--patch` 覆盖层。

## 5. M0 验证实测(T5)

- ✅ **hello 工具 + `--patch` 加载**:`cordis.patch.yml` 用 `insert` 语法(非 insert 的 patch 会被当作「修改已有 entry」而报 `entry not found`)。`dsh --profile web --patch <file> --dump-config` 验证 entry 解析成功(`file:///...dist/index.js`)。
- ✅ **storage domain**:`defineDomain({name, version, tables})` + `domainTable(zodSchema)`;`ctx.storageDomain.open(spec)` → `domain.table('x').get/put/update`、`domain.global.get/set`、`domain.close()`。inject 键 `'storageDomain'` 满足。
- ⚠️ **zod 版本坑**:`dsh-storage-domain` 依赖 `zod@4.4.3`(精确),与项目 `zod@4.6.7` 是两个实例、类型不兼容(`_zod.version.minor` 4 vs 6)。需将项目 zod 对齐到 `4.4.3`。
- ⚠️ **domainTable 语义**:`domainTable` 的 schema 是**单条记录**类型(KV 表本身即 Record),不要用 `z.record(...)`,否则 `put(key, value)` 的 value 类型错误。
- 其余 profile bundle 报错(anysearch/dshmarket)是用户 web profile 已有插件与 dsh 0.2.1 不兼容所致,与本插件无关。

## 7. 本地安装验证(2026-11-09)

- ✅ `dsh plugin --profile web add .` 会把插件以 `link:` 方式写入 profile 的 `package.json` 依赖,并 link 进 profile 的 `node_modules`。
- ⚠️ **环境坑**:profile bundles 里残留的 `dsh-our-free-model`(link 目标目录已不存在)会阻断 `plugin add` 的 reconcile 阶段(`cannot resolve profile bundle`),需先从 bundles + dependencies 移除(已备份 `*.bak-market-watch`)。
- ✅ **挂载方式**:market-watch 挂在 profile 的 `cordis.patch.yml`(`insert` 行,与该环境 matt-board/workstation 惯例一致;`patchReload: live` 下改 patch 热生效)。
- ✅ 验证:`dsh --profile web --dump-config`(不带 --patch)配置树出现 `- id: market-watch / name: dsh-plugin-market-watch`,从 profile 安装解析成功。

## 8. Windows「不受信任挂载点」安全机制(2026-11-10 重大环境发现)

- **现象**:`dsh web` 启动崩溃于 profile `node_modules` 内 link 目录的 realpath(`UNKNOWN`,errno -4094);cmd 报 `The path cannot be traversed because it contains an untrusted mount point`(0xc00004be)。
- **根因**:Windows Redirection Trust Mitigation(随 2026 年 WSL 3.x/安全更新强制生效)——junction 创建时按**创建者令牌**计算信任级别并持久化:**非提权进程创建 = untrusted**,普通进程遍历也被拒;同卷/跨卷无关。pnpm `link:` 依赖、`file:` 以外的所有 junction 型 link 全部失效。
- **修复**:以**管理员终端**运行 `mklink /J` 重建 junction(创建即 trusted)。脚本:`.scratch/fix-junctions-admin.ps1`。已验证:普通进程可穿透 trusted junction,`dsh --dump-config` 正常解析全部 bundle。
- **注意**:新增任何 link 型插件依赖,都必须在管理员终端创建 junction;另外 profile 里 3 个断链 junction(目标目录已不存在的 `dsh-matt-board`/`dsh-our-free-model`/`dsh-workstation`)已删除并在 patch 层注释挂载行,恢复项目后需同样以管理员重建。
- `@anysearch/anysearch-dsh`、`dshmarket` 为版本不兼容(仅 skip 警告,无害),可在插件管理页卸载清理。

## 9. M0 实机验证结论(2026-11-10,全部通过)

- ✅ **宿主侧**:dsh web 插件管理页显示组件「market-watch · 运行中」——`apply(ctx)` 执行,8 个工具注册、storage domain 打开均成功。
- ✅ **浏览器侧**:shell.overlay 徽章「📈 market-watch」在界面显示——esbuild + `__ModuleLoader__` 客户端 bundle 加载成功(与官方构建约定一致的复刻方案验证通过)。
- ✅ **Agent 工具链路**:对话内调用 `market_watch_hello` 返回 `hello from market-watch`。
- ✅ **数据源**:新浪 A 股/东财基金估值已用真实数据验证(§6);天天基金 `fundgz` 失效已用 `FundMNFInfo` 替代。
- **M0 遗留**(随后续里程碑):迷你条候选位置实测、通知可达性验证(宿主侧全局通知)、简报 schedule 生命周期、桌面版 npm 包安装(需发布)。

## 10. T12 侧栏 tab 实机验证(2026-11-10,通过)

- ✅ **全链路验证**(playwright 自动化实测,dsh web @8123 + token 信任 URL):右侧栏引导页出现「行情」入口盒 → 点击打开 tab(selected)→ 列表渲染真实行情(贵州茅台 cn_sh:600519,1436.74 / −0.57%)→ Console 零错误零警告。
- ⚠️ **关键约束:sidebar tab 是 per-session 的**——`SidebarRightController.openTab(kind)` 内部 `this.require()` 取 on-screen session,**无活动会话时点击入口静默无反应**(dsh 设计,非 bug)。入口可用性依赖「已有会话」。引导页入口(guides)+ 会话页头按钮(`conversation.session.header.actions`,session 作用域)均已注册;页头按钮需在真实会话视图中确认渲染。
- ⚠️ **slot 注册格式坑**:list 型 slot(`shell.overlay`、`conversation.session.header.actions`)必须用 `options.id`,keyed 型 slot(`sidebar.right.pane.tab`)用 `options.key`;用错直接抛错并回滚整个客户端插件。
- ⚠️ **客户端 inject 依赖链**:`dsh-api-remotes` 需要 `dsh-api-gateway`;tab 注册需要 `dsh-client-ui-sidebar-right` + `dsh-client-ui-conversation`。缺失时整个客户端半区静默不加载。
- dsh web 认证:CLI 打印 `?token=...` 信任 URL;自动化测试需带 token 访问。

## 11. T15 分组/排序/置顶 实测(2026-11-10,通过)+ 存储版本坑

- ✅ playwright 实测:分组标题「A股(1)」渲染(空组自动隐藏)、排序按钮三态循环(⇅ 默认→涨幅↑→涨幅↓,setSortMode 持久化)、📌 置顶(「📌 贵州茅台」渲染)、移动分组(select 改值 → 茅台移入「港股(1)」,原组消失)。Console 零错误。
- ⚠️ **存储版本坑**:`compatibleVersions: [1]` 对 json backend 的 whole-unit 版本检查**不生效**——`version: 2` 打开 v1 存储直接 `fatal: StorageError: version-mismatch`,dsh 启动失败。结论:**新增表 + global 加 `z.default()` 字段这类向后兼容变更,保持 version 不变**;真正改记录格式时才 bump,且 bump 前需手工迁移或删除旧单元文件(`dshHomePath('storages')`)。
- 前端搜索焦点:playwright `type` 全局键盘输入会落到主输入框,需先 click/fill 目标输入框。

## 12. Windows 中文编码坑(2026-11-10)

- ⚠️ **PowerShell 5.1 按 GBK 解析无 BOM 的 UTF-8 `.ps1` 文件**——含中文 here-string 的创建脚本执行后,`gh issue create` 收到的是已损坏的字符串(GitHub issue 标题/正文乱码,如「瀹夸富」)。
- **修复方式**:node 全程 UTF-8 读源文件,经 `execSync(…, { input: JSON.stringify({title, body}) })` 把 payload 走 stdin 传给 `gh api -X PATCH --input -`。修复脚本 `.scratch/fix-titles.mjs`。
- **预防**:凡经 CLI 传中文,一律用 `--body-file`/`--input`(UTF-8 文件)+ node 调用,不要在 PowerShell 5.1 里内联中文字符串。

## 14. M3 全功能实机测试(2026-11-10,playwright 自动化,通过)

| # | 测试 | 结果 |
| --- | --- | --- |
| 1 | 对话批量添加多市场标的(hk00700/usAAPL/fut_cn:IF0/fx:susdcny) | ✅ 四市场全部入自选;模型经搜索自动纠正 `usAAPL`→`us:AAPL.OQ` |
| 2 | 行情 tab 多市场分组渲染 | ✅ A股/港股/美股/其他 组均正确(期货/外汇按设计落「其他」组) |
| 3 | 行点击展开 K线详情 | ✅ 「23 bars · 近 1 个月(前复权)」,SVG 折线渲染 |
| 4 | 提醒设置(对话 → alert_set) | ✅ 规则 ID `cn_sh:600519\|price\|up` 正确持久化 |
| 5 | 盘后简报(对话 → brief_generate) | ✅ 表格化输出(多市场行情 + 状态「开市」标注) |
| 6a | 隐私模式(默认)查询持仓 | ✅ 只返回百分比(+3.14%,与 (350.69−340)/340 一致),金额被过滤——模型自行按汇率换算 |
| 6b | 开启隐私后查询持仓 | ✅ 350.69 美元 × 汇率 6.67 → 人民币计价输出 |
| 7 | Console | ✅ 全程 0 errors 0 warnings |

- 已知测试环境注意:playwright `type` 全局键盘输入不可靠,需 `fill` 精确输入框 ref。

## 15. M4 数据源实测(2026-11-10)

| 能力 | 数据源 | 结果 |
| --- | --- | --- |
| 沪深港通资金 | 东财 `push2.eastmoney.com/api/qt/kamt.rtmin/get` | ✅ s2n 分钟级数组 |
| 板块资金流 | 东财 `push2.eastmoney.com/api/qt/clist/get?fs=m:90+t:2&fields=f12,f14,f62,f184` | ✅ f12=代码 f14=名称 f62=主力净流入(元) f184=涨跌幅 |
| 概念资金流 | 同上 `t:3` | ✅ |
| 快讯 | 金十 `www.jin10.com/flash_newest.js` | ✅ 数组 `[{id,time,type,data:{title,content}}]` |
| 快讯-选股宝 | `xuangubao.cn/ding_pan/brief` | ❌ 返回 SSR HTML,无公开 JSON API → 快讯单源(金十) |
| 基金排行 | `fund.eastmoney.com/data/rankhandler.aspx`(需 Referer `fund.eastmoney.com/data/fundranking.html`) | ✅ datas CSV:0=代码 1=名称 4=净值 6=日涨幅 11=近一年 |
| 基金排行-mobapi | `FundRank/List` 变体 | ❌ 404/无访问权限 |

## 13. M3 数据源实测(2026-11-10)

| 数据源 | 地址 | 结果 |
| --- | --- | --- |
| 美股-腾讯 | `qt.gtimg.cn/q=usAAPL`(`v_` 前缀,`~` 分隔) | ✅ 现价/昨收/开盘/成交量/时间/涨跌幅/**币种 USD** 字段齐全 |
| 美股-新浪 | `hq.sinajs.cn/list=gb_aapl`(需 Referer) | ✅ 备用源,逗号分隔,含 52 周高低 |
| 期货国内-新浪 | `nf_IF0` | ✅ 开/高/低/现价/成交量/持仓量 |
| 期货国际-新浪 | `hf_OIL` | ✅ 现价/买卖价/高低/时间/昨收/日期 |
| 外汇-新浪 | `fx_susdcny` | ✅ 时间/买卖价/昨收/涨跌额/涨跌幅/日期 |
| 汇率 | `fx_susdcny`(USDCNY 6.6705)、`fx_shkdcny`(HKDCNY 0.8505) | ✅ FR-WL-06 外币折算源确定 |

- 编码:均 GB18030(与 A 股一致);美股腾讯字段自带币种(`USD`),汇率字段无名称乱码问题(数字为主)。
- 终端显示的「乱码」是 console 代码页问题,GBK 解码后中文字段(名称)正确——fixture 测试为准。

## 16. M4 实机测试(2026-11-10,playwright 自动化,通过)+ code-review

| # | 测试 | 结果 |
| --- | --- | --- |
| 1 | market_flow(north 北向资金) | ✅ 数据返回;北向实时净流入为 0——**沪深交易所 2024-08 起停发北向实时买卖数据,接口返回占位值,属数据源限制**(板块/概念资金流不受影响);模型正确识别并提示 |
| 2 | market_news_flash | ✅ 金十实时快讯表格(分钟级) |
| 3 | market_fund_rank | ✅ 排行表格(代码/名称/净值/日涨幅/近一年) |
| 4 | share_card | ✅ 工具调用 + 「收益榜」卡片(仅名称与百分比,金额隐藏,SVG 经 XML 转义) |
| 5 | 页头 📈 按钮(M2 遗留确认) | ✅ 在真实会话视图中渲染 |

- M4 code-review 修复:share_card SVG XML 转义(名称含 `<>&` 破坏标记)。
- 遗留观察:Webhook 推送需用户配置真实地址后验证;Skill 分发约定(skills/ 目录随包)待 dsh 实机确认加载。

## 6. M0 数据源实测(2026-11-09)

| 数据源 | 地址 | 结果 |
| --- | --- | --- |
| 新浪 A 股 | `https://hq.sinajs.cn/list=sh600519`(需 `Referer: http://finance.sina.com.cn/`) | ✅ 有效,GB18030,字段:名称/今开/昨收/现价/最高/最低/... |
| 腾讯港股 | `https://qt.gtimg.cn/q=hk00700` | ✅ 有效,字段:名称/代码/现价/涨跌/成交量... |
| 腾讯搜索 | `https://smartbox.gtimg.cn/s3/?v=2&q=腾讯&t=all` | ✅ 有效,返回候选(市场~代码~名称),可搜到 hk00700 |
| 天天基金估值 | `https://fundgz.1234567.com.cn/js/110022.js` | ❌ **已下架**:HTTP/HTTPS/带 Referer/带 rt 均返回「页面未找到」 |
| 东方财富基金详情 | `https://fund.eastmoney.com/pingzhongdata/110022.js` | ✅ 有效,含名称/代码/费率,但**非实时估值** |

**结论**:leek-fund 使用的天天基金 `fundgz` 实时估值接口已失效,需另寻基金估值替代源(FR-DATA 的「多源/单源兜底」风险实锤)。基金详情可用东财 `pingzhongdata`。

### 基金估值替代源(已实测)

| 接口 | 地址 | 结果 |
| --- | --- | --- |
| 东方财富 FundMNFInfo | `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?Fcodes={代码}&plat=Wap&deviceid=Wap&product=EFund&version=2.0.0` | ✅ **有效,`fundgz` 直接替代**:字段 `FCODE/SHORTNAME/PDATE/NAV/GSZ/GSZZL/GZTIME`,盘中 `GSZ` 返回估值,收盘后为 `null` |
| 东方财富历史净值 | `https://api.fund.eastmoney.com/f10/lsjz?fundCode={代码}&pageIndex=1&pageSize=20`(需 Referer `fundf10.eastmoney.com/`) | ✅ 有效,`LSJZList` 含 `FSRQ/DWJZ/LJJZ/JZZZL` |

字段映射(旧 fundgz → 新 FundMNFInfo):`fundcode→FCODE`、`name→SHORTNAME`、`jzrq→PDATE`、`dwjz→NAV`、`gsz→GSZ`、`gszzl→GSZZL`、`gztime→GZTIME`。

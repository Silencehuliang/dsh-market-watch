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

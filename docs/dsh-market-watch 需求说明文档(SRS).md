# dsh-market-watch 需求说明文档(SRS)

> 版本 v0.1 | 日期 2026-11-09 | 读者:负责开发的 AI Agent 项目暂定名 `dsh-market-watch`(npm 包名 `dsh-plugin-market-watch`,不要沿用「韭菜盒子」的名称和图标)。 一句话:把 VSCode 插件「韭菜盒子」(leek-fund)的盯盘能力,做成 DeepSeek Harness(dsh)的插件,并利用 dsh 自带的 Agent 能力做出差异化。

## 0. 给 AI Agent 的阅读指引

1. 本文档是需求来源。开发方式是「先验证、再分阶段交付」,不要一次性全做。第 9 章定义了 M0 到 M4 里程碑,从 M0 开始。
2. 标注【待验证】的内容,是调研时没有被官方文档证实的假设(接口地址、API 名称、扩展点行为)。遇到时先写最小代码验证,再决定实现方式,结果记录到 `docs/verification.md`。
3. 不要编造 dsh 的 API。以官方文档为准(附录 A),与本文档冲突时以官方文档为准,并把差异记录到 `docs/verification.md`。
4. 编号规则:FR-xxx 为功能需求,NFR-xxx 为非功能需求。优先级:P0 必须,P1 应该,P2 可选。
5. 每个里程碑的交付物:可运行代码、单元测试、README 更新、该里程碑验收清单的勾选结果。
6. 所有外部网络请求都在宿主(Node)侧发出,浏览器侧只与宿主通信。
7. 插件只做行情展示与信息整理,不提供买卖建议(见 NFR-COMP)。

## 1. 项目背景与目标

### 1.1 背景

- dsh(DeepSeek Harness)是 DeepSeek 于 2026 年 8 月开源的 Agent 运行时,MIT 协议,TypeScript 编写,基于 Cordis 插件框架,口号是「一切皆插件」。桌面版 v0.2 预览版于 2026-09-29 发布,可在插件管理页输入 npm 包名安装插件。
- 在开发工具里低打扰地看盘是稳定需求。VSCode 插件「韭菜盒子」是这一需求的代表(GitHub 约 3.7k star)。
- dsh 生态里已有相关插件,但覆盖不全:
  - `dsh-plugin-astock`:A 股数据工具集,10 个工具(行情、K 线、技术指标、全市场快照、日线、财报、资金流向、可转债)。
  - `dsh-plugin-aportfolio`:A 股自选与持仓,跨会话记忆,使用东方财富公开接口,无需 token。
  - `dsh-fund-research`:公募基金研究报告,数据可追溯。
  - 以上均未覆盖:基金盘中估值、港股/美股/期货/外汇、常驻行情面板、价格提醒、定时简报。

### 1.2 目标

- G1 复刻韭菜盒子的核心体验:自选行情常驻可见、持仓盈亏、涨跌提醒、详情与走势。
- G2 双通道:同一份数据层,同时服务「给人看的界面」和「Agent 可调用的工具」。
- G3 利用 dsh 的 Agent 能力做差异化:用自然语言询问自选、定时盘前盘后简报、由模型解读快讯与个股,而不是自己再做一个简陋的 AI 面板。
- G4 数据层稳健:单源可靠 + 缓存兜底 + 源健康监控、限频、交易日历,降低免费接口失效带来的影响。

### 1.3 非目标

- 不做交易下单、不接券商账户、不做量化回测。
- 不提供买卖建议、荐股、收益承诺。
- 不做付费/Pro 体系,不做云端账号与云同步。
- 不复制韭菜盒子的名称、图标、截图和文案。
- 首版不做数字货币(币安)视图,不做移动端。

### 1.4 参考产品与许可

- 参考产品:韭菜盒子(leek-fund),VSCode 插件。其开源仓库协议为 BSD-3-Clause(以仓库 LICENSE 为准)。可以参考思路与公开接口的用法;若直接复用其代码,必须保留版权声明与许可文本。
- 韭菜盒子的 Pro 功能(个性化面板、Webhook 群推送、板块行情、自建行情中继、LeekAgent)属于其商业部分,本项目只参考功能形态,不复制其实现。

## 2. 术语

| 术语 | 含义 |
| --- | --- |
| dsh | DeepSeek Harness,Agent 运行时 |
| Cordis | dsh 使用的插件框架;插件通过 `apply(ctx)` 注册服务、工具、UI |
| Host / 宿主 | dsh 的 Node 进程,插件的服务端部分运行在这里 |
| Client / 浏览器侧 | dsh 的 Web 界面(桌面版内嵌),插件的 UI 部分运行在这里 |
| Slot | Web Client 的 UI 插槽,插件通过 `ctx.slots.register()` 贡献组件 |
| Remote | 宿主服务暴露给浏览器侧调用的方法 |
| Storage Domain | dsh 的领域 KV 存储,用 zod 声明 schema |
| 估值 | 基金盘中的估算净值,不是官方净值 |
| 盘中 / 近实时 | 行情为交易时段内的盘中数据,可能延迟(基金估值约 2 分钟),非官方收盘数据 |
| 自选 | 用户关注的标的列表(股票、基金等) |
| 持仓 | 用户为标的录入的份额/金额/成本,用于计算盈亏 |

## 3. 运行环境与技术约束

### 3.1 宿主与工具链

- 目标宿主:dsh 桌面版(官方预览版优先,社区桌面壳需单独验证)与 Web 版(`dsh web`)。dsh 仍在预览阶段,调研时桌面版为 v0.2 预览,社区插件常见的兼容声明为 `>=0.1.7-rc.1 <0.3.0`。插件必须在 package.json 声明宿主版本范围,并在 README 记录实际验证过的版本。
- 开发环境:Node 22.19+ 或 24+,pnpm,TypeScript(strict),ESM。
- 本地调试:在 dsh 仓库根目录执行 `pnpm dsh web --patch /绝对路径/cordis.yml` 加载未发布的插件。
- 安装方式:`dsh plugin --profile web add <npm 包名>`;桌面版在插件管理页输入 npm 包名。注意 dsh 要求带 `--profile` 参数。
- 存储后端:标准 profile 已组合;本插件的持久化依赖 `ctx.storageDomain`。

### 3.2 插件形态

- 本插件是「宿主 + 浏览器」双侧 bundle:
  - 宿主侧:`apply(ctx)` 中声明 `export const inject = [...]`,注册工具(`ctx.tools.register(defineTool(...))`)、存储域、定时器、Remote 方法。
  - 浏览器侧:通过 `dsh.client` 清单加载,`apply(ctx)` 里用 `ctx.slots` 注册 UI,用 `ctx.sidebarRightTabs` 注册侧栏页。
- 打包约定(来自社区实践,【待验证】,以官方 client 包骨架为准):
  - package.json 声明 `dsh.bundle.patch`(指向 `cordis.patch.yml`)与 `dsh.client`;
  - `exports` 同时导出宿主入口与 `./client`;
  - 浏览器侧产物为官方约定的 lazy-CJS factory bundle,仓库外构建需复刻官方 clientBundle 的输出约定。
- 插件不得读取 dsh 的凭据(API Key 等),不得访问与行情无关的宿主能力。

### 3.3 已知 dsh 扩展点(调研结论)

| 能力 | 扩展点 | 要点 |
| --- | --- | --- |
| 工具 | `ctx.tools.register(defineTool({name, description, parameters, output, execute}))` | 需声明 `inject = ['tools']` |
| 浏览器 UI | `ctx.slots.register()` / `ctx.slots.inject(key, cb)` | 向其他包的 slot 贡献内容必须用 `inject` |
| 会话页头动作 | slot `conversation.session.header.actions` | list 型,按 id 与 order 排序 |
| 输入框区域 | slots `conversation.input.*`、`conversation.composer.dock` 等 | 候选位置,M0 实测 |
| 悬浮层 | slot `shell.overlay` | 社区插件用它挂悬浮组件 |
| 右侧 Sidebar 自定义页 | `ctx.sidebarRightTabs.register({id, kind, ...})` + slot `sidebar.right.pane.tab`(按 id keyed) | 布局仅存内存,每会话一份,刷新后折叠 |
| 实时数据流 | `ctx.resources.register({protocol, open(address, {signal})})` | 提供方产出帧(首帧为当前值,之后每次变化一帧);自定义协议需要声明合并【待验证】 |
| 持久化 | `ctx.storageDomain.open(defineDomain(...))` | 用 zod 声明 schema;json 或 sqlite 后端 |
| 定时 | `ctx.schedule`(cron、daily、weekly、every,带 IANA 时区) | 本质是「向原会话投递一条提醒」,最小间隔 60 秒,无外部通知渠道 |
| 宿主到浏览器的方法 | Remote(宿主服务方法暴露给浏览器侧) | schedule 服务用 `@Remote('list')` 这种方式暴露 |
| 变更通知 | Cordis 事件,如 `schedule/changed`(无 payload,客户端收到后重新拉取) | 本插件可沿用此模式 |
| 斜杠命令 | `ctx.commands.register()` | P2 |
| 系统提示词段 | `ctx.systemPrompt.section()` | 可选,用于约束模型不给投资建议 |

## 4. 参考产品调研:韭菜盒子功能全景

### 4.1 功能清单

| 模块 | 功能 | 实现要点 |
| --- | --- | --- |
| 资产覆盖 | 基金(含海外基金)、A 股/港股/美股、国内期货、外汇牌价;数字货币视图默认隐藏 | 各资产独立 Service 与 Provider |
| 视图结构 | 侧栏分基金、股票、雪球新闻、设置等视图;股票按 A 股/港股/美股分组 | TreeView |
| 状态栏 | 行情条(选定标的的价格与涨跌幅)+ 收益条(基金与股票分开,点击进入持仓设置) | 可分别隐藏 |
| 显示模板 | 状态栏与侧栏文案用 `${name}`、`${price}`、`${percent}` 等占位符定制,支持 padRight | 变量见附录 B |
| 视觉定制 | 涨跌颜色、涨跌图标(多套趣味图标) | 配置项 |
| 排序 | 三态循环:原顺序(含置顶)、升序、降序;基金支持按持仓金额排序 |  |
| 分组 | 基金与股票支持自定义分组 |  |
| 添加标的 | GUI 模糊搜索(名称或代码),也可手改配置 | 股票用腾讯 smartbox 搜索;基金用内置建议列表 |
| 持仓 | 基金:份额或金额;股票:成本价、数量、是否已清仓;自动算当日与累计盈亏、收益率 | 公式见附录 B |
| 外币估值 | 外币计价的股票按现汇卖出价折算为人民币 |  |
| 收益分享 | 将持仓收益生成图片分享 | html2canvas |
| 走势与详情 | 股票实时 K 线/分时、基金实时走势、历史净值、基金趋势统计图、基金排行榜 | 新浪图表图片;东方财富页面(经本地反向代理嵌入) |
| 资金流向 | 沪深港通资金、北向、南向;板块/概念资金流向;牛熊风向标 | 东方财富数据中心 |
| 资讯 | 雪球动态与新闻;选股宝异动快讯、金十资讯输出到 OUTPUT 面板 | 雪球需要 cookie token |
| 提醒 | 价格与涨跌幅阈值,上穿/下穿分别设置;同一标的 3 分钟节流;触发时弹窗,可删除该提醒或全局关闭 | Pro 版另有企业微信/钉钉/飞书 Webhook |
| AI(3.20+) | AI 选股快讯宝、投资助手、个股分析 | OpenAI 兼容 SDK,用户自配 apiKey/baseUrl/model;上下文 = 日 K CSV + 快讯 + 研究帖 |
| 轮询机制 | 默认 5 秒,最小 3 秒;开市自动刷新,节假日关闭 | 股基、数字货币、外汇三个独立定时器 |
| 配置导入导出 | 支持跨环境迁移配置 |  |

### 4.2 关键观察(决定本项目的设计)

1. 它的核心价值是「低打扰的常驻」:行情始终可见但不抢注意力。dsh 没有原生状态栏,需要在 M0 找到替代位置。
2. 数据层最脆弱:全部依赖免费网页接口。已知问题包括:接口更换后基金搜得到却显示不出来;用户开代理后股票面板无数据(报 Stock error)。因此本项目把「单源兜底、缓存、限频、可诊断」列为 P0。
3. 韭菜盒子的 AI 部分是在 VSCode 里补一个简易 agent;dsh 本身就是 agent,本项目不自建聊天面板,而是把数据做成工具交给 dsh 的模型。
4. 其商业化把「个性化面板、Webhook 推送、板块行情、行情中继、Agent」放在 Pro。本项目把其中对 dsh 用户有价值的部分(Agent、提醒、板块资金流向)纳入开源范围。

## 5. 数据源规格

### 5.1 已知数据源(来自韭菜盒子实现调研)

| 数据 | 来源 | 调研到的要点 | 状态 |
| --- | --- | --- | --- |
| A 股、美股、期货盘中行情 | 新浪 `https://hq.sinajs.cn/list=代码1,代码2` | 批量请求用逗号拼接;返回 GB18030 编码,需要转码;请求头需带 `Referer: http://finance.sina.com.cn/`;期货代码加前缀 `nf_`(国内)或 `hf_`(国际);美股前缀在不同文档里出现 `gb_` 与 `usr_` 两种 | 美股前缀【待验证】 |
| 港股行情与股票搜索 | 腾讯财经 | 用于港股行情与 smartbox 搜索 | 具体地址【待验证】 |
| 基金盘中估值 | 天天基金 `fundgz.1234567.com.cn/js/{基金代码}.js?rt=时间戳` | JSONP 格式 `jsonpgz(...)`;关键字段:估算净值 `gsz`、估算涨幅 `gszzl`、估值时间 `gztime`;数据约有 2 分钟延迟;接口曾变更导致部分基金无数据 | 字段以实际返回为准 |
| 基金排行 | 新浪财经基金排行接口 |  | 【待验证】 |
| A 股日线(前复权) | 搜狐财经 `q.stock.sohu.com` | 用于个股分析的日 K | 【待验证】 |
| 港股日线(前复权) | 腾讯 `web.ifzq.gtimg.cn` |  | 【待验证】 |
| 板块/地域资金流向 | 东方财富数据中心 `https://data.eastmoney.com/dataapi/bkzj/getbkzj?key=f174&code=m%3A90%2Bt%3A1` | 数值需转换为「亿」单位 | 【待验证】 |
| 趋势图(图片) | 新浪图表 `image.sinajs.cn/newchart`(按 A 股、美股、港股、期货区分子路径) | GIF 图片,实现简单 | 可选 |
| 雪球新闻 | 雪球 | 需先请求首页提取 `xq_a_token` 等 cookie | 首版不做 |
| 快讯 | 选股宝、金十 |  | P1 |

### 5.2 数据源要求

- 所有数据源必须通过统一的 Provider 接口接入(见 FR-DATA),业务代码不得直接拼接第三方 URL。
- 每个 Provider 必须具备:超时、重试、限频、错误分类(网络错误/解析错误/限流/无数据),以及固定样例(fixture)用于测试。
- 必须在 README 与设置页声明「数据来自公开网页接口,可能延迟、不准确或随时失效」。
- 不得绕过站点的访问控制;请求频率遵守 NFR-PERF 的限频要求。
- 标注【待验证】的数据源,开发前先用脚本实测可用性,并把实测结果(返回样例、字段、编码)写进 `docs/verification.md`。

## 6. 功能需求

格式:编号(优先级 / 里程碑)描述。验收:可检验的标准。

### 6.1 数据层(FR-DATA)

- **FR-DATA-01**(P0 / M1)标的规范化。内部统一用 `{market}:{code}` 标识,market 取 cn\_sh、cn\_sz、cn\_bj、hk、us、fund、fut\_cn、fut\_gl、fx;提供与各数据源代码的双向转换(例如 sh600519 对应 cn\_sh:600519,hk00700 对应 hk:00700)。验收:单测覆盖 A 股三所、港股、美股、基金、国内期货、国际期货、外汇;非法输入返回明确错误。
- **FR-DATA-02**(P0 / M1)Provider 接口。定义行情(批量报价、搜索)、基金(估值、历史净值、排行)、K 线、资金流向、快讯等接口;每个实现声明支持的 market 与能力;统一返回第 8.2 节的结构。验收:新增一个 Provider 不需要修改业务代码。
- **FR-DATA-03**(P0 / M1)单源可靠 + 缓存兜底。多数资产仅有一个免费源,因此以「单源 + 优雅降级」为主:主源失败(超时、解析失败、空数据)时返回缓存数据并标注「已过期」;连续失败的源进入冷却期(默认 60 秒),冷却期内改用缓存。仅对确有第二个免费源的场景(如 A 股行情)配置 Provider 优先级回退,此时主源失败自动切换备源,结果标注 source。验收:模拟主源失败时返回缓存数据且标注过期;冷却期内不再请求主源;存在备源时切换正确且 source 标注正确。
- **FR-DATA-04**(P0 / M1)批量请求与缓存。同一轮询周期内合并为批量请求(新浪支持逗号拼接);行情缓存有效期默认等于轮询间隔;UI、工具、提醒共用同一份缓存,不得各自请求。验收:同一周期内对同一数据源的请求数不超过 ceil(标的数 / 单次批量上限)。
- **FR-DATA-05**(P0 / M1)限频与退避。每个数据源设全局限频(默认每秒不超过 5 个请求);遇到 HTTP 429、403 或解析异常时指数退避。验收:压测下不超过限频,退避后能恢复。
- **FR-DATA-06**(P0 / M1)休市判定。以行情返回的日期与时间戳判断是否休市(参照韭菜盒子:比较价格日期与当前时间),同时内置各市场常规交易时段(A 股 09:30-11:30、13:00-15:00 北京时间;港股 09:30-12:00、13:00-16:00;美股按美东时间并处理夏令时)。休市时展示最后价格并标注「已收盘」。验收:周末、午休、收盘后、节假日的状态都能正确判定。
- **FR-DATA-07**(P1 / M2)交易日历。用于节假日关闭高频轮询与定时简报跳过;策略为「内置固定节假日表 + 行情时间戳纠正」,零外部依赖;A 股调休(周末补班)需每年手动更新一次。验收:节假日不发起高频轮询。
- **FR-DATA-08**(P0 / M1)错误可诊断。每个 Provider 的最近错误、最近成功时间、延迟统计可通过工具 `market_diagnostics` 与设置页查看;代理导致的网络失败要给出明确提示(韭菜盒子的常见问题之一)。验收:断网或代理异常时给出可读的原因。
- **FR-DATA-09**(P0 / M1)编码与解析容错。新浪返回需按 GB18030 解码(优先用 `TextDecoder('gb18030')`,不可用再用 iconv-lite【待验证】);所有解析对缺失字段容错。验收:用含缺失字段的 fixture 测试不崩溃。
- **FR-DATA-10**(P1 / M3)日 K 线。提供前复权日 K(A 股、港股),区间支持 1w、1m、3m、6m、1y;可选紧凑 CSV 输出以节省 token。验收:输出长度与区间匹配,格式稳定。
- **FR-DATA-11**(P1 / M4)资金流向。沪深港通、北向、南向资金,板块与概念资金流向(单位:亿)。

### 6.2 自选、分组与持仓(FR-WL)

- **FR-WL-01**(P0 / M1)自选管理。增删标的,重复添加幂等;M1 支持 A 股与基金,M3 扩展到港股、美股、期货、外汇。
- **FR-WL-02**(P0 / M1)模糊搜索添加。按名称或代码搜索,先返回候选(代码、名称、市场、类型)再添加。验收:输入「腾讯」能搜到 hk:00700;输入基金名称片段能搜到基金。
- **FR-WL-03**(P0 / M2)分组。自定义分组,并提供默认分组(A 股、港股、美股、基金);一个标的属于一个分组;分组可排序。
- **FR-WL-04**(P0 / M2)排序与置顶。三态循环(原顺序含置顶 / 涨跌幅升序 / 降序);原顺序下置顶项始终在组首。
- **FR-WL-05**(P0 / M1)持仓录入。基金:份额或金额,份额优先,只有金额时按昨日净值反推份额;股票:成本价、数量、是否已清仓。
- **FR-WL-06**(P0 / M1)盈亏计算。按附录 B 公式计算当日盈亏、累计盈亏、收益率;收盘后保持最后一次盈亏;实现为纯函数。M1 仅覆盖人民币标的;外币标的按汇率折算人民币(汇率来源【待验证】)随外币标的在 M3 一并交付。验收:第 10 章的用例全部通过。
- **FR-WL-07**(P1 / M2)导入导出。自选、分组、持仓、提醒与设置可导出为 JSON 并导入(带版本号校验)。
- **FR-WL-08**(P2 / M4)收益分享图。生成收益图片,默认隐去金额,只显示百分比。

### 6.3 Agent 工具(FR-TOOL)

通用要求:

- 工具名用 snake\_case,按领域加前缀:`market_`、`watchlist_`、`holdings_`、`alert_`、`brief_`。
- 每个工具的 description 必须说明「数据可能延迟,不构成投资建议」。
- 输出同时提供结构化 JSON 与简洁文本;结构里必含 `asOf`(数据时间)、`source`(数据源)、`delayed`(是否延迟或估值)。
- 只读行情类工具无副作用。写类工具(自选、持仓、提醒的增删改)是否需要用户审批【待验证,参考 dsh 审批子系统】。
- 列表输出要限制条数并提示截断,控制 token 消耗。

| 工具 | 优先级 / 里程碑 | 主要参数 | 返回 |
| --- | --- | --- | --- |
| market\_search\_symbol | P0 / M1 | query, market? | 候选列表 |
| market\_quote | P0 / M1 | symbols\[\] | 每个标的的 Quote |
| market\_fund\_estimate | P0 / M1 | codes\[\] | 估值、官方净值、估值时间、是否估值 |
| market\_status | P0 / M1 | markets? | 各市场开收盘状态与下次开盘时间 |
| market\_diagnostics | P0 / M1 | 无 | 各 Provider 健康状态 |
| watchlist\_list | P0 / M1 | group? | 自选及最新行情 |
| watchlist\_add / watchlist\_remove | P0 / M1 | symbol, group? | 操作结果 |
| holdings\_get | P0 / M1 | 无 | 持仓与盈亏(受隐私模式限制) |
| holdings\_set | P0 / M1 | symbol, shares?, amount?, costPrice? | 操作结果 |
| portfolio\_summary | P1 / M2 | 无 | 当日盈亏、累计盈亏、涨跌分布、最大波动标的 |
| alert\_list / alert\_set / alert\_delete | P0 / M3 | symbol, 阈值参数 | 操作结果 |
| market\_kline | P1 / M3 | symbol, range, format | 日 K(json 或 csv) |
| market\_fund\_history | P1 / M3 | code, range | 历史净值 |
| brief\_generate | P1 / M3 | kind(pre\_open 或 post\_close) | 简报所需的结构化数据,由模型整理成文 |
| market\_flow | P1 / M4 | kind(north、south、sector、concept) | 资金流向 |
| market\_news\_flash | P1 / M4 | source?, limit? | 快讯列表 |
| market\_fund\_rank | P2 / M4 | type?, period? | 基金排行 |

- **FR-TOOL-01**(P0 / M1)隐私模式。设置项 `privacy.exposeAmounts` 默认 false。为 false 时 `holdings_get` 与 `portfolio_summary` 只返回百分比和相对权重,不返回金额、份额、成本价;为 true 才返回具体数值。原因:工具结果会进入模型上下文(云端)。验收:默认模式下输出中不含任何绝对金额字段。
- **FR-TOOL-02**(P0 / M1)数据而非结论。工具只返回数据与计算结果,不返回买卖建议;工具描述与可选的系统提示词段(`ctx.systemPrompt.section()`)提示模型「仅作信息整理,不构成投资建议」。

### 6.4 界面(FR-UI)

- **FR-UI-01**(P0 / M2)行情侧栏页。在右侧 Sidebar 注册自定义 tab(kind 例如 `market`),展示分组后的自选列表:名称、代码、现价、涨跌幅,有持仓时显示当日盈亏;支持排序、分组折叠、涨跌颜色。入口:会话页头动作按钮(slot `conversation.session.header.actions`)与 Sidebar 引导页入口。已知限制:布局仅存内存、每会话一份、刷新后需重新打开,因此必须有显眼的一键打开入口,并在 README 说明。
- **FR-UI-02**(P0 / M2)常驻迷你条。作为状态栏的替代,在输入框附近或悬浮层显示用户选定的 1 到 3 个标的与总盈亏,单行,点击打开侧栏页。候选位置:`conversation.input.*`、`conversation.composer.dock`、`shell.overlay`。M0 实测后选定;没有合适位置时降级为只有侧栏页。
- **FR-UI-03**(P0 / M2)添加与删除。侧栏页内有「添加」按钮,打开搜索框(FR-WL-02);行内可删除;更多菜单可设置持仓、分组、置顶。
- **FR-UI-04**(P1 / M3)详情页。点击标的进入同一 tab 内的二级视图:基本行情、分时与日 K、基金走势与历史净值、该标的的提醒与持仓。图表优先用零依赖 SVG 自绘(社区有先例),不引入大型图表库。
- **FR-UI-05**(P0 / M2)设置。通过 dsh 的设置页机制(参考官方「新增设置页」手册)或侧栏页内设置区,提供:轮询间隔(默认 5 秒,最小 3 秒)、涨跌颜色(默认红涨绿跌,可反转)、迷你条标的、显示模板、隐私模式、启用的市场、数据源优先级、提醒开关。
- **FR-UI-06**(P1 / M2)显示模板。迷你条与列表行文案支持 `${name}`、`${price}`、`${percent}`、`${icon}`、`${earnings}` 等占位符(变量见附录 B)。
- **FR-UI-07**(P0 / M2)性能与可见性。页面不可见(tab 未展示或窗口隐藏)时暂停 UI 刷新;UI 更新节流为每秒最多 1 次;200 条以内的列表无明显卡顿。
- **FR-UI-08**(P0 / M2)主题与国际化。跟随 dsh 的浅色与深色主题;文案通过 `ctx.locale` 字典提供中文和英文。
- **FR-UI-09**(P1 / M2)空状态与错误态。无自选、数据源失败、休市、延迟数据都有明确提示:休市标「已收盘」,基金标「估值(延迟约2分钟)」,数据源失效时标「已过期」。

### 6.5 提醒(FR-ALERT)

- **FR-ALERT-01**(P0 / M3)规则。每个标的可设价格上穿、价格下穿、涨跌幅上穿、涨跌幅下穿阈值(各自可选),规则持久化。
- **FR-ALERT-02**(P0 / M3)评估。在宿主侧轮询周期内评估,不依赖 UI 是否打开;比较上一次与当前值判断是否「穿越」阈值;仅在开市时评估。
- **FR-ALERT-03**(P0 / M3)节流。同一标的同一规则 3 分钟内最多触发一次,可配置。
- **FR-ALERT-04**(P0 / M3)通知。触发时在 dsh 界面给出可见通知(toast 或悬浮层,可用组件【待验证】,社区有 dsh-notify 使用 shell.overlay 的先例);通知可「删除该规则」「关闭全部提醒」;内容含标的、触发条件、当前价、时间。
- **FR-ALERT-05**(P0 / M3)禁止用 dsh schedule 做轮询。提醒评估必须由宿主侧定时器驱动。原因:dsh schedule 每次触发都会向会话投递一条提醒并驱动一个模型回合,最小间隔 60 秒,既贵又慢。
- **FR-ALERT-06**(P2 / M4)Webhook。可选把提醒推送到企业微信、钉钉、飞书机器人;默认关闭;Webhook 地址视为敏感信息,仅本地存储;宿主出站域名受设置限制。

### 6.6 定时简报(FR-BRIEF)

- **FR-BRIEF-01**(P1 / M3)简报任务。提供斜杠命令或工具,协助用户用 `ctx.schedule` 的 cron(五字段加 `Asia/Shanghai` 时区)创建定时任务,例如工作日 09:00 盘前、15:10 收盘复盘。提示词模板由插件提供,内容是「依次调用 market\_status、watchlist\_list、portfolio\_summary、market\_news\_flash 后整理简报」。
- **FR-BRIEF-02**(P1 / M3)休市处理。cron 无法识别法定节假日,因此 `market_status` 在休市日明确返回「休市」,提示模型直接回复「今日休市」,避免生成无意义的简报。
- **FR-BRIEF-03**(P1 / M3)内容规范。盘前:隔夜外盘、重要快讯、自选关注点;盘后:当日自选涨跌排行、持仓盈亏、资金流向摘要。内容必须基于工具数据,不得编造未检索到的数字;数据缺口要声明。
- **FR-BRIEF-04**(P2 / M4)Skill。可选附带一个 dsh Skill,说明「盯盘助手」的用法与简报模板。

### 6.7 资讯(FR-NEWS)

- **FR-NEWS-01**(P1 / M4)快讯。接入选股宝与金十快讯作为 `market_news_flash` 的数据源;按时间倒序,支持 limit 与关键词过滤;缓存不超过 60 秒。
- **FR-NEWS-02**(P2 / 后续)雪球。需要 cookie token,首版不做。

### 6.8 配置(FR-CFG)

- **FR-CFG-01**(P0 / M1)所有配置项集中在一个 zod schema 中,有默认值与校验;非法配置不得导致插件崩溃。
- **FR-CFG-02**(P0 / M1)配置与用户数据分开存储:设置放在 global 单例,自选、持仓、提醒放在表中。
- **FR-CFG-03**(P1 / M2)存储格式带版本号,为后续迁移预留。

## 7. 非功能需求

- **NFR-PERF** 性能与资源
  - 轮询默认 5 秒,最小 3 秒;仅在「该市场开市」且「有可见 UI 或有启用的提醒」时高频轮询;否则暂停,或降为低频(例如 60 秒)只用于保持缓存。
  - `apply()` 不发起网络请求,轮询延迟到首次使用时启动。
  - 每个数据源遵守 FR-DATA-05 的限频。
  - 插件卸载时清理所有定时器、订阅和 slot 注册(放进 `ctx.effect` 并返回释放函数)。
- **NFR-REL** 可靠性
  - 任何 Provider 的失败不得影响 dsh 主流程;所有未捕获异常都要被捕获并记录。
  - 优雅降级:数据源全部失败时,UI 展示缓存数据并标注「已过期」。
  - 重启后自选、持仓、提醒、设置完整恢复。
- **NFR-SEC** 安全
  - 不读取 dsh 的凭据与 API Key;不访问与行情无关的宿主能力。
  - 出站请求域名白名单:默认只允许内置 Provider 的域名,在设置页可见。
  - 持仓、提醒、Webhook 地址只存本地;日志中不得出现持仓金额与 Webhook 地址。
  - 依赖最小化并锁定版本,不引入带安装脚本的可疑依赖,不使用 eval,不上报任何使用数据(无遥测)。
  - 背景:社区报道指出 dsh 的插件权限隔离存在缺口,装插件可能读到 API Key,所以本插件要主动收窄自己的能力并在 README 写明。
- **NFR-PRIV** 隐私:隐私模式见 FR-TOOL-01;任何情况下都不把持仓上传到第三方(模型上下文除外,且受隐私模式控制)。
- **NFR-COMP** 合规与免责
  - README、设置页、工具描述都要包含:数据来自公开网页接口,可能延迟或不准确,仅供信息参考,不构成投资建议。
  - 界面与提示词中禁止出现荐股、买卖点位建议、收益承诺的文案。
  - 遵守各数据源的使用条款。
- **NFR-COMPAT** 兼容性
  - 声明并验证宿主版本范围;桌面版官方支持 Windows x64 与 macOS Apple Silicon,Linux 不做要求。
  - 在 README 维护「已验证版本」表。
- **NFR-I18N** 中文与英文,文案走字典。
- **NFR-OBS** 可观测:日志分级(error、warn、info、debug),默认 info;`market_diagnostics` 提供 Provider 健康信息。
- **NFR-TEST** 测试
  - 核心逻辑(规范化、盈亏、提醒、休市判定、缓存兜底、解析容错)行覆盖率不低于 80%。
  - Provider 用 fixture 测试,CI 不访问真实网络;另提供需显式开启的 live smoke 脚本。
- **NFR-DOC** 文档与发布
  - 中英文 README(安装、配置、免责声明、兼容版本表、已知限制)和 CHANGELOG。
  - 发布到 npm,仓库加 GitHub topic `dsh-plugin`,README 写明带 `--profile` 的安装命令。
- **NFR-LIC** 许可证采用 MIT;若复用了 leek-fund 代码,保留其 BSD-3-Clause 声明。

## 8. 架构设计(建议)

### 8.1 总体:一份数据层,三个出口

```text
外部数据源(新浪 / 腾讯 / 天天基金 / 东方财富 ...)
        |
   [Providers]   各数据源适配器
        |
   [QuoteService]   单源兜底 + 缓存 + 限频 + 轮询 + 休市判定
     |         |              |
 Agent 工具   Remote / 事件    AlertEngine --> 通知
     |         |
     |     浏览器侧:Sidebar tab / 迷你条 / 设置
     |
 [StorageDomain]   自选 / 分组 / 持仓 / 提醒 / 设置
```

### 8.2 核心类型(示意)

```ts
type Market = 'cn_sh' | 'cn_sz' | 'cn_bj' | 'hk' | 'us' | 'fund' | 'fut_cn' | 'fut_gl' | 'fx'
type SymbolId = `${Market}:${string}`

interface Quote {
  symbol: SymbolId
  name: string
  price: number
  change: number
  changePercent: number
  open?: number; high?: number; low?: number; prevClose?: number
  volume?: number; amount?: number
  time: string            // ISO 8601,含时区
  status: 'open' | 'closed' | 'pre' | 'post' | 'halt' | 'unknown'
  source: string          // provider id
  delayedSec?: number
  stale?: boolean         // 缓存兜底时标记「已过期」
}

interface FundEstimate {
  code: string
  name: string
  navDate: string          // 最近官方净值日期
  nav?: number             // 最近官方单位净值
  estimateNav?: number     // 估值净值
  estimatePercent?: number // 估值涨幅
  estimateTime?: string    // 估值时间
  isEstimate: true         // 界面必须标注「估值(延迟约2分钟)」
  source: string
}
```

### 8.3 存储域(示意,schema 用 zod 声明)

域名 `market_watch`,版本 1。域名与表名必须符合 dsh 的单元命名规则(可安全用作文件名与 SQL 标识符片段)。

```ts
// tables
watchlist: Record<SymbolId, { symbol: SymbolId; name: string; groupId: string; pinned: boolean; order: number; addedAt: string }>
groups:    Record<string, { id: string; name: string; order: number; builtin?: boolean }> // builtin id 映射 market(如 builtin:cn_sh)
holdings:  Record<SymbolId, { shares?: number; amount?: number; costPrice?: number; costNav?: number; currency?: string; closed?: boolean; updatedAt: string }>
alerts:    Record<SymbolId, { rules: Array<{ id: string; kind: 'price' | 'percent'; direction: 'up' | 'down'; threshold: number; enabled: boolean; lastTriggeredAt?: string }> }>
// global singleton
settings:  { intervalMs; riseColor: 'red' | 'green'; miniBarSymbols; labelFormat; privacy: { exposeAmounts }; enabledMarkets; providerPriority; alertsEnabled; alertThrottleSec }
```

字段语义(与详细设计一致):`shares` 对股票 = 数量、对基金 = 份额;`costPrice` 为股票成本价,`costNav` 为基金成本净值;`currency` 默认 `CNY`,M3 外币折算依赖它。`groups.builtin` 的 id 映射 market(如 `builtin:cn_sh`),新增标的按 market 自动落入对应内置分组;用户可移动到自定义分组,自定义分组可跨市场。

### 8.4 宿主服务与浏览器通信

- 宿主侧 `MarketService` 通过 Remote 暴露方法:快照(snapshot)、搜索、自选/持仓/提醒/设置的增删改查、诊断。
- 每轮轮询结束后发出一个无 payload 的更新事件(沿用 schedule 的「变更通知后客户端重新拉取」模式),浏览器侧收到后调用快照方法刷新。
- 备选方案:注册自定义资源协议,由提供方持续推送行情帧。选型规则:若自定义协议在不修改 dsh 核心的前提下可用,优先使用;否则用 Remote 加事件。该决定在 M0 做出并记录。

### 8.5 轮询流程

1. 汇总需要的标的:自选、提醒标的、迷你条标的的并集。
2. 过滤出当前开市的标的(首次加载时休市标的也请求一次)。
3. 按 Provider 批量请求,写入缓存。
4. 发出更新事件,评估提醒。
5. 不在每个轮询周期写存储。
6. 暂停条件:无可见 UI 且无启用提醒,或全部市场休市。

### 8.6 目录结构(建议)

```text
dsh-market-watch/
  package.json
  cordis.patch.yml
  docs/verification.md
  src/                    宿主侧
    index.ts              apply():装配
    core/
      symbol.ts           标的规范化
      providers/          sina.ts tencent.ts tiantian.ts eastmoney.ts ...
      quote-service.ts    兜底 / 缓存 / 限频 / 轮询
      calendar.ts         休市判定与交易日历
      portfolio.ts        盈亏计算(纯函数)
      alerts.ts           提醒评估(纯函数 + 节流)
    storage.ts            defineDomain
    tools/                各工具定义
    remote.ts             Remote 方法
    client/               浏览器侧
      index.tsx           slot 与 tab 注册
      WatchTab.tsx  MiniBar.tsx  Settings.tsx  Detail.tsx
  tests/                单测与 fixtures
  README.md  README.en.md  CHANGELOG.md
```

### 8.7 技术选型建议

- TypeScript(strict)、ESM、zod。
- 浏览器侧用 React(dsh 的 slot 组件是 React);不引入大型图表库。
- 测试框架建议 vitest,若 dsh 仓库有约定则从其约定;构建工具以官方 client 打包约定为准。
- 网络请求用 Node 全局 fetch 加 `AbortSignal.timeout`;依赖最小化并锁版本。

## 9. 里程碑与验收

### M0 验证(目标 2 到 4 天)

交付:最小插件(一个 hello 工具、一个 Sidebar 自定义 tab、至少两个迷你条候选位置的原型、一个 Remote 方法、一次存储域读写、一个通知原型)和 `docs/verification.md`。

- [ ] 能用 `--patch` 在 `dsh web` 加载宿主加浏览器双侧插件
- [ ] 打包成 npm 包后,可在桌面版插件管理页安装并生效(记录桌面版本)
- [ ] Sidebar tab 能打开,并显示来自宿主 Remote 的数据
- [ ] 迷你条候选位置的实测结论(可见性、是否随会话切换消失、是否遮挡输入)
- [ ] 通知组件选型与可达性:dsh 是否有宿主侧全局通知(无则降级为「未读计数 + UI 可见时补发」)
- [ ] 实时数据推送方案结论:自定义资源协议还是 Remote 加事件
- [ ] 写类工具是否触发审批
- [ ] 各【待验证】数据源的实测样例(返回内容、字段、编码)

### M1 数据层与工具

范围:FR-DATA-01 到 06、08、09;FR-WL-01、02、05、06;M1 的全部工具;FR-TOOL-01、02;FR-CFG-01、02。

- [ ] 在 dsh 对话里说「看一下我的自选」,能调用 `watchlist_list` 并得到行情
- [ ] 主源失败时返回缓存并标注「已过期」(有备源时自动切换并标注来源)
- [ ] 默认隐私模式下输出不含绝对金额
- [ ] 第 10 章单测全部通过,CI 不访问真实网络
- [ ] README 含安装、配置、免责声明

### M2 界面

范围:FR-WL-03、04、07;FR-UI-01 到 03、05 到 09;FR-DATA-07;FR-CFG-03;`portfolio_summary`。

- [ ] 一键打开行情页,分组、排序、涨跌颜色可用
- [ ] 迷你条可用(或确认降级方案)
- [ ] 页面不可见时暂停刷新
- [ ] 深浅色主题与中英文可用
- [ ] 200 条自选无明显卡顿

### M3 提醒、简报与多市场

范围:FR-ALERT-01 到 05;FR-BRIEF-01 到 03;FR-DATA-10;FR-UI-04;港股、美股、期货、外汇;`market_kline`、`market_fund_history`、`brief_generate`。

- [ ] 价格穿越阈值时界面通知,3 分钟内不重复
- [ ] 没有任何 UI 打开时提醒仍能触发
- [ ] 休市日简报返回「休市」
- [ ] 港股、美股、期货、外汇行情与休市判定正确
- [ ] 简报 schedule 在会话关闭后是否仍触发(生命周期验证)

### M4 增强

范围:FR-DATA-11;FR-NEWS-01;FR-WL-08;FR-ALERT-06;FR-BRIEF-04;`market_flow`、`market_news_flash`、`market_fund_rank`。

- [ ] 对应功能可用,数据缺失时有降级提示

## 10. 测试用例

> 本章按各 FR 的「验收」字段组织,每条拆为可执行用例(输入 → 期望输出)。核心纯函数(规范化、盈亏、提醒、休市判定、解析容错、单源兜底)需达到 NFR-TEST 的 80% 行覆盖率;Provider 用 fixture 测试,CI 不访问真实网络。

### 10.1 标的规范化(FR-DATA-01)

| 用例 | 输入 | 期望输出 |
| --- | --- | --- |
| TC-SYM-01 | `sh600519` | `cn_sh:600519` |
| TC-SYM-02 | `sz000001` | `cn_sz:000001` |
| TC-SYM-03 | `bj430047` | `cn_bj:430047` |
| TC-SYM-04 | `hk00700` | `hk:00700` |
| TC-SYM-05 | `gb_aapl` / `usr_aapl` | `us:AAPL`(前缀以实测为准) |
| TC-SYM-06 | 基金 `110022` | `fund:110022` |
| TC-SYM-07 | `nf_IF0` | `fut_cn:IF0` |
| TC-SYM-08 | `hf_OIL` | `fut_gl:OIL` |
| TC-SYM-09 | 非法 `xyz123` | 返回明确错误,不抛出未捕获异常 |

### 10.2 单源兜底(FR-DATA-03)

| 用例 | 输入 | 期望输出 |
| --- | --- | --- |
| TC-FB-01 | 主源超时/解析失败,缓存有数据 | 返回缓存数据,`source` 标主源,`stale=true`(标注「已过期」) |
| TC-FB-02 | 主源连续失败 | 进入冷却期(默认 60 秒),期间不再请求主源,直接返回缓存 |
| TC-FB-03 | 存在备源(如 A 股),主源失败 | 自动切换备源,`source` 标注备源 id |
| TC-FB-04 | 主源与备源均失败且无缓存 | 返回空并上报可诊断错误,不影响 dsh 主流程 |

### 10.3 休市判定(FR-DATA-06)

| 用例 | 输入 | 期望输出 |
| --- | --- | --- |
| TC-CAL-01 | 北京时间周六 | 休市 |
| TC-CAL-02 | A 股 12:00(午休) | 休市(午间) |
| TC-CAL-03 | A 股 16:00(收盘后) | 已收盘,展示最后价格 |
| TC-CAL-04 | 法定节假日 | 休市 |
| TC-CAL-05 | 美股美东时间夏令时(如 7 月) | 按美东 EDT 正确判定盘前/盘中/盘后 |

### 10.4 解析容错(FR-DATA-09)

| 用例 | 输入 | 期望输出 |
| --- | --- | --- |
| TC-PARSE-01 | GB18030 编码的新浪返回 | 正确解码,中文名称不乱码 |
| TC-PARSE-02 | 缺失部分字段的 fixture | 不崩溃,缺失字段填默认/`--` |
| TC-PARSE-03 | 空返回 / `FAILED` | 归类为「无数据」,进入兜底流程 |

### 10.5 盈亏计算(FR-WL-05 / FR-WL-06)

| 用例 | 输入 | 期望输出 |
| --- | --- | --- |
| TC-PL-01 | 基金金额反推份额:金额 10000,昨日净值 1.2 | 份额 ≈ 8333.33 |
| TC-PL-02 | 基金当日盈亏:份额 8333.33,估值 1.21,昨日净值 1.2 | 当日盈亏 ≈ 83.33 |
| TC-PL-03 | 股票当日盈亏:现价 10.5,昨收 10,数量 1000 | 500 |
| TC-PL-04 | 股票累计盈亏:现价 11,成本 9,数量 1000 | 2000 |
| TC-PL-05 | 股票收益率:现价 11,成本 9 | 22.22% |
| TC-PL-06 | 收盘后无新行情 | 保持最后一次盈亏,不归零 |
| TC-PL-07 | 已清仓标的 | 不参与盈亏计算(或明确标记清仓) |

### 10.6 隐私模式(FR-TOOL-01)

| 用例 | 输入 | 期望输出 |
| --- | --- | --- |
| TC-PRIV-01 | `privacy.exposeAmounts=false` 调 `holdings_get` | 输出不含金额、份额、成本价字段,只含百分比/权重 |
| TC-PRIV-02 | `privacy.exposeAmounts=false` 调 `portfolio_summary` | 输出不含任何绝对金额 |
| TC-PRIV-03 | `privacy.exposeAmounts=true` | 返回完整数值 |

### 10.7 提醒(FR-ALERT-02 / FR-ALERT-03)

| 用例 | 输入 | 期望输出 |
| --- | --- | --- |
| TC-ALT-01 | 价格上穿:前值 < 阈值,当前 ≥ 阈值 | 触发 |
| TC-ALT-02 | 未穿越阈值 | 不触发 |
| TC-ALT-03 | 同规则 3 分钟内第二次穿越 | 不触发(节流) |
| TC-ALT-04 | 休市时段 | 不评估 |

## 附录 A:dsh 官方文档清单

> 开发时以 dsh 官方文档为准,与本文档冲突时以官方为准,差异记录到 `docs/verification.md`。以下是需核实的官方主题索引(具体 URL 以官方仓库 docs 为准,不在此编造):

- 插件生命周期:`apply(ctx)`、`export const inject = [...]`
- 工具:`ctx.tools.register(defineTool(...))`
- UI 插槽:`ctx.slots.register()` / `ctx.slots.inject()`,slot 名:`shell.overlay`、`conversation.session.header.actions`、`conversation.input.*`、`conversation.composer.dock`、`sidebar.right.pane.tab`
- 侧栏:`ctx.sidebarRightTabs.register()`
- 存储:`ctx.storageDomain.open(defineDomain(...))`,单元命名规则
- 定时:`ctx.schedule`(cron/daily/weekly/every,IANA 时区)
- Remote:宿主服务方法暴露(`@Remote(...)`)
- 资源流:`ctx.resources.register({protocol, open(...)})`
- 审批子系统:写类工具是否触发审批
- 设置页手册(新增设置页)
- 打包约定:client bundle(lazy-CJS factory)、`dsh.bundle.patch`、`dsh.client`、`exports` 导出宿主入口与 `./client`
- 宿主版本范围声明与兼容矩阵(社区常见 `>=0.1.7-rc.1 <0.3.0`)

## 附录 B:变量与公式

> 公式口径对齐 leek-fund 源码(BSD-3-Clause)。其核心为 `caculateEarnings(money, price, currentPrice) = (money / price) × currentPrice − money`,即「份额 = 金额 ÷ 成本价,盈亏 = 份额 × (现价 − 成本价)」。本项目在基金上扩展了「份额优先」录入(见 FR-WL-05)。

### B.1 变量与占位符

| 变量 | 含义 | 占位符 |
| --- | --- | --- |
| `name` | 名称 | `${name}` |
| `price` | 现价(股票)/ 估值(基金 `gsz`) | `${price}` |
| `prevClose` | 昨收 | `${prevClose}` |
| `updown` | 涨跌额 | `${updown}` |
| `percent` | 涨跌幅(%) | `${percent}` |
| `open` / `high` / `low` | 今开 / 最高 / 最低 | `${open}` `${high}` `${low}` |
| `volume` / `amount` | 成交量 / 成交额 | `${volume}` `${amount}` |
| `costPrice` | 成本价(股票) | `${costPrice}` |
| `costNav` | 成本净值(基金,对应 leek-fund `unitPrice`) | — |
| `shares` | 份额 / 数量 | `${shares}` |
| `earnings` | 盈亏金额 | `${earnings}` |
| `earningPercent` | 收益率(%) | `${earningPercent}` |
| `icon` | 涨跌图标 | `${icon}` |

### B.2 公式

- **涨跌额**:`updown = price − prevClose`
- **涨跌幅**:`percent = updown ÷ prevClose × 100%`(`prevClose ≤ 0` 时记 0)
- **份额反推(基金)**:`shares = amount ÷ costNav`;只有金额时按昨日净值反推 `shares = amount ÷ 昨日净值`
- **持仓市值**:股票 `marketValue = shares × price`;基金 `marketValue = shares × 估值`
- **当日盈亏**:
  - 股票:`(price − prevClose) × shares`
  - 基金:`(估值 − 昨日净值) × shares`
- **累计盈亏**:`(price − costPrice) × shares = marketValue − (costPrice × shares)`
- **收益率**:`(price − costPrice) ÷ costPrice × 100%`
- **组合总收益率**:`Σ累计盈亏 ÷ Σ(成本 × 份额) × 100%`
- **收盘后**:保持最后一次盈亏,不因后续无数据而归零
- **外币折算(人民币)**:`原币金额 × 现汇卖出价`(汇率来源【待验证】,随外币标的在 M3 交付)

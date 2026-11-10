/**
 * dsh-plugin-market-watch — Client plugin entry (browser half).
 *
 * T12:右侧 Sidebar 注册「行情」tab(kind: market),经 Remote 网关读取
 * 宿主侧自选行情快照;会话页头提供一键打开入口(FR-UI-01)。
 */
import { useCallback, useEffect, useState } from 'react'
import { MARKET_REMOTE } from './remote.js'

export const inject = ['slots', 'remote', 'sidebarRightTabs', 'sidebarRight']

const MARKET_ID = 'dsh-plugin-market-watch'
const MARKET_KIND = 'market'
const RED = '#E5484D'
const GREEN = '#12B76A'

function pctColor(p: number): string {
  return p >= 0 ? RED : GREEN
}

function MarketBody(props: any) {
  const [items, setItems] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try {
      const r = await props.fetchQuotes()
      setItems(r.items)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [props.fetchQuotes])
  useEffect(() => {
    void reload()
    const t = setInterval(() => void reload(), 5000)
    return () => clearInterval(t)
  }, [reload])

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    padding: '6px 10px',
    borderBottom: '1px solid rgba(128,128,128,0.15)',
    fontSize: 13,
  }

  if (error) {
    return (
      <div style={{ padding: 14, fontSize: 13, opacity: 0.8 }}>
        行情数据加载失败:{error}
      </div>
    )
  }
  if (items === null) {
    return <div style={{ padding: 14, fontSize: 13, opacity: 0.6 }}>加载中…</div>
  }
  if (items.length === 0) {
    return (
      <div style={{ padding: 14, fontSize: 13, opacity: 0.7 }}>
        暂无自选标的。在对话中说「帮我添加 sh600519 到自选」即可添加。
      </div>
    )
  }
  return (
    <div>
      {items.map((it) => (
        <div key={it.symbol} style={rowStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {it.name}
              {it.stale ? <span style={{ opacity: 0.55, fontWeight: 400 }}>（已过期）</span> : null}
            </span>
            <span style={{ opacity: 0.55, fontSize: 11 }}>{it.symbol}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{it.price > 0 ? it.price : '—'}</span>
            <span style={{ color: pctColor(it.changePercent), fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
              {it.changePercent >= 0 ? '+' : ''}
              {it.changePercent.toFixed(2)}%
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function apply(ctx: any): void {
  // Remote 挂载:浏览器侧贡献 → 反射取命名空间
  let ns: any
  ctx.effect(async () => {
    const dispose = await ctx.remote.$mount(MARKET_REMOTE)
    ns = (ctx.reflect as unknown as { get(name: string): unknown }).get('remote.market-watch')
    if (ns === undefined) throw new Error('market-watch: the market-watch Remote namespace did not mount')
    return () => {
      ns = undefined
      void dispose()
    }
  }, 'market-watch: remote')

  const fetchQuotes = async () => {
    if (ns === undefined) throw new Error('market-watch Remote is not mounted')
    const result = await ns.getWatchlist()
    if (result.ok) return result.value as { items: any[] }
    throw result.error
  }

  // 阶段一:注册 tab 类型
  ctx.effect(
    () =>
      ctx.sidebarRightTabs.register({
        id: MARKET_ID,
        kind: MARKET_KIND,
        priority: 'extension',
        title: () => '行情',
      }),
    'market-watch: tab definition',
  )

  // 阶段二:tab body(keyed slot,key = tab id)
  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register(
          { name: 'sidebar.right.pane.tab', key: MARKET_ID, inject: () => ({ fetchQuotes }) },
          (props: any) => <MarketBody fetchQuotes={props.fetchQuotes} />,
        ),
      ),
    'market-watch: tab body',
  )

  // 阶段二:tab title
  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab.title', () =>
        ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: MARKET_ID }, () => (
          <span>行情</span>
        )),
      ),
    'market-watch: tab title',
  )

  // 会话页头一键打开入口(FR-UI-01)
  ctx.effect(
    () =>
      ctx.slots.inject('conversation.session.header.actions', () =>
        ctx.slots.register(
          {
            name: 'conversation.session.header.actions',
            key: MARKET_ID,
            inject: () => ({
              openMarket: () => ctx.sidebarRight.openTab(MARKET_KIND),
            }),
          },
          (props: any) => (
            <button
              onClick={props.openMarket}
              title="打开行情侧栏"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14 }}
            >
              📈
            </button>
          ),
        ),
      ),
    'market-watch: header entry',
  )
}

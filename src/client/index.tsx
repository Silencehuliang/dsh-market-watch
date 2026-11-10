/**
 * dsh-plugin-market-watch — Client plugin entry (browser half).
 *
 * T12:右侧 Sidebar「行情」tab(kind: market),Remote 读自选行情;
 * T14:tab 内搜索添加(FR-WL-02/FR-UI-03)与行内删除;会话页头一键入口(FR-UI-01)。
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

const TYPE_LABEL: Record<string, string> = {
  stock: '股票',
  index: '指数',
  fund: '基金',
  other: '其他',
}

function MarketBody(props: any) {
  const [items, setItems] = useState<any[] | null>(null)
  const [groups, setGroups] = useState<any[]>([])
  const [sortMode, setSortModeState] = useState<string>('default')
  const [error, setError] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<any[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const reload = useCallback(async () => {
    try {
      const r = await props.fetchQuotes()
      setItems(r.items)
      setGroups(r.groups ?? [])
      setSortModeState(r.sortMode ?? 'default')
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

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setCandidates(null)
        return
      }
      setBusy('search')
      try {
        const r = await props.search(q.trim())
        setCandidates(r.items)
      } catch {
        setCandidates([])
      } finally {
        setBusy(null)
      }
    },
    [props.search],
  )

  useEffect(() => {
    const t = setTimeout(() => void doSearch(query), 400)
    return () => clearTimeout(t)
  }, [query, doSearch])

  const add = async (symbol: string, name: string) => {
    setBusy(symbol)
    try {
      await props.addSymbol(symbol, name)
      setQuery('')
      setCandidates(null)
      setShowSearch(false)
      await reload()
    } finally {
      setBusy(null)
    }
  }

  const remove = async (symbol: string) => {
    setBusy(symbol)
    try {
      await props.removeSymbol(symbol)
      await reload()
    } finally {
      setBusy(null)
    }
  }

  const togglePin = async (symbol: string, pinned: boolean) => {
    setBusy(symbol)
    try {
      await props.setPinned(symbol, pinned)
      await reload()
    } finally {
      setBusy(null)
    }
  }

  const move = async (symbol: string, groupId: string) => {
    setBusy(symbol)
    try {
      await props.moveToGroup(symbol, groupId)
      await reload()
    } finally {
      setBusy(null)
    }
  }

  const cycleSort = async () => {
    const next = sortMode === 'default' ? 'asc' : sortMode === 'asc' ? 'desc' : 'default'
    setSortModeState(next) // 立即反馈
    await props.setSortMode(next)
    await reload()
  }

  const toggleCollapse = (groupId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 10px',
    borderBottom: '1px solid rgba(128,128,128,0.15)',
    fontSize: 13,
  }
  const ghostBtn: React.CSSProperties = {
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: 'inherit',
    opacity: 0.7,
    fontSize: 12,
    padding: '0 4px',
  }
  const SORT_LABEL: Record<string, string> = { default: '默认', asc: '涨幅↑', desc: '涨幅↓' }

  if (error) {
    return (
      <div style={{ padding: 14, fontSize: 13, opacity: 0.8 }}>
        行情数据加载失败:{error}
      </div>
    )
  }

  // 按 groupId 分桶(保序);组顺序按宿主返回的 groups
  const byGroup = new Map<string, any[]>()
  for (const it of items ?? []) {
    const key = groups.some((g) => g.id === it.groupId) ? it.groupId : 'builtin:other'
    const bucket = byGroup.get(key) ?? []
    bucket.push(it)
    byGroup.set(key, bucket)
  }
  const nameOf = (id: string) => groups.find((g) => g.id === id)?.name ?? id

  return (
    <div>
      <div style={{ ...rowStyle, borderBottom: 'none' }}>
        <span style={{ fontWeight: 600, fontSize: 12, opacity: 0.7 }}>自选</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={ghostBtn} title="切换排序(默认→涨幅升→涨幅降)" onClick={() => void cycleSort()}>
            ⇅ {SORT_LABEL[sortMode] ?? sortMode}
          </button>
          <button style={ghostBtn} onClick={() => setShowSearch((v) => !v)}>
            {showSearch ? '收起' : '＋ 添加'}
          </button>
        </div>
      </div>

      {showSearch && (
        <div style={{ padding: '4px 10px', borderBottom: '1px solid rgba(128,128,128,0.15)' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索代码或名称,如「茅台」「腾讯」「110022」"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '5px 8px',
              fontSize: 13,
              borderRadius: 6,
              border: '1px solid rgba(128,128,128,0.35)',
              background: 'transparent',
              color: 'inherit',
            }}
          />
          {busy === 'search' && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>搜索中…</div>}
          {candidates !== null && candidates.length === 0 && !busy && (
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>无匹配结果</div>
          )}
          {candidates?.map((c) => (
            <div key={c.symbol} style={{ ...rowStyle, borderBottom: 'none', padding: '4px 0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                <span style={{ opacity: 0.55, fontSize: 11 }}>
                  {c.symbol} · {TYPE_LABEL[c.type] ?? c.type}
                </span>
              </div>
              <button style={ghostBtn} disabled={busy !== null} onClick={() => void add(c.symbol, c.name)}>
                {busy === c.symbol ? '…' : '添加'}
              </button>
            </div>
          ))}
        </div>
      )}

      {items === null ? (
        <div style={{ padding: 14, fontSize: 13, opacity: 0.6 }}>加载中…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: 14, fontSize: 13, opacity: 0.7 }}>
          暂无自选标的。点上方「＋ 添加」搜索添加。
        </div>
      ) : (
        groups
          .filter((g) => (byGroup.get(g.id)?.length ?? 0) > 0)
          .map((g) => {
            const bucket = byGroup.get(g.id)!
            const isCollapsed = collapsed.has(g.id)
            return (
              <div key={g.id}>
                <div
                  style={{
                    ...rowStyle,
                    cursor: 'pointer',
                    background: 'rgba(128,128,128,0.08)',
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                  onClick={() => toggleCollapse(g.id)}
                >
                  <span>
                    {isCollapsed ? '▸' : '▾'} {g.name}({bucket.length})
                  </span>
                </div>
                {!isCollapsed &&
                  bucket.map((it) => (
                    <div key={it.symbol} style={rowStyle}>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span
                          style={{
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {it.pinned ? '📌 ' : ''}
                          {it.name}
                          {it.stale ? <span style={{ opacity: 0.55, fontWeight: 400 }}>（已过期）</span> : null}
                        </span>
                        <span style={{ opacity: 0.55, fontSize: 11 }}>{it.symbol}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {it.price > 0 ? it.price : '—'}
                          </span>
                          <span
                            style={{
                              color: pctColor(it.changePercent),
                              fontSize: 12,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {it.changePercent >= 0 ? '+' : ''}
                            {it.changePercent.toFixed(2)}%
                          </span>
                        </div>
                        <button
                          style={ghostBtn}
                          title={it.pinned ? '取消置顶' : '置顶'}
                          disabled={busy !== null}
                          onClick={() => void togglePin(it.symbol, !it.pinned)}
                        >
                          📌
                        </button>
                        <select
                          value={it.groupId}
                          title="移动到分组"
                          disabled={busy !== null}
                          onChange={(e) => void move(it.symbol, e.target.value)}
                          style={{
                            fontSize: 11,
                            background: 'transparent',
                            color: 'inherit',
                            border: '1px solid rgba(128,128,128,0.3)',
                            borderRadius: 4,
                          }}
                        >
                          {groups.map((g2) => (
                            <option key={g2.id} value={g2.id}>
                              {g2.name}
                            </option>
                          ))}
                        </select>
                        <button
                          style={ghostBtn}
                          title="从自选删除"
                          disabled={busy !== null}
                          onClick={() => void remove(it.symbol)}
                        >
                          {busy === it.symbol ? '…' : '✕'}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )
          })
      )}
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

  const call = async (method: string, ...args: unknown[]) => {
    if (ns === undefined) throw new Error('market-watch Remote is not mounted')
    const fn = (ns as Record<string, ((...a: unknown[]) => unknown) | undefined>)[method]
    if (typeof fn !== 'function') throw new Error(`market-watch Remote method missing: ${method}`)
    const result = await fn(...args)
    if ((result as { ok?: boolean }).ok) return (result as { value: unknown }).value
    throw (result as { error: unknown }).error
  }

  const fetchQuotes = async () => call('getWatchlist') as Promise<{ items: any[] }>

  // 阶段一:注册 tab 类型 + 侧栏引导页入口盒(点击即打开 tab)
  ctx.effect(
    () =>
      ctx.sidebarRightTabs.register({
        id: MARKET_ID,
        kind: MARKET_KIND,
        priority: 'extension',
        title: () => '行情',
        guide: [
          {
            id: 'market-guide-entry',
            order: 50,
            title: () => '行情',
            description: () => '自选行情、持仓盈亏与涨跌提醒',
          },
        ],
      }),
    'market-watch: tab definition',
  )

  // 阶段二:tab body(keyed slot,key = tab id)
  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register(
          {
            name: 'sidebar.right.pane.tab',
            key: MARKET_ID,
            inject: () => ({
              fetchQuotes,
              search: (q: string) => call('search', q) as Promise<{ items: any[] }>,
              addSymbol: (symbol: string, name?: string) => call('addToWatchlist', symbol, name),
              removeSymbol: (symbol: string) => call('removeFromWatchlist', symbol),
              setPinned: (symbol: string, pinned: boolean) => call('setPinned', symbol, pinned),
              moveToGroup: (symbol: string, groupId: string) => call('moveToGroup', symbol, groupId),
              setSortMode: (mode: string) => call('setSortMode', mode),
            }),
          },
          (props: any) => <MarketBody {...props} />,
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

  // 常驻徽章(M0 的 shell.overlay,list slot 用 id)
  ctx.effect(
    () =>
      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          { name: 'shell.overlay', id: MARKET_ID, order: 10 },
          () => (
            <div
              style={{ padding: '2px 8px', fontSize: 12, opacity: 0.85 }}
              title="dsh-plugin-market-watch 已加载"
            >
              📈 market-watch
            </div>
          ),
        ),
      ),
    'market-watch: overlay badge',
  )

  // 会话页头一键打开入口(FR-UI-01)
  ctx.effect(
    () =>
      ctx.slots.inject('conversation.session.header.actions', () =>
        ctx.slots.register(
          {
            name: 'conversation.session.header.actions',
            id: MARKET_ID,
            order: 20,
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

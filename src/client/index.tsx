/**
 * dsh-plugin-market-watch — Client plugin entry (browser half).
 *
 * T12:右侧 Sidebar「行情」tab(kind: market),Remote 读自选行情;
 * T14:tab 内搜索添加与行内删除;T15:分组/排序/置顶;T16:迷你条;
 * T17:设置区;T18:i18n 字典 + 不可见暂停刷新 + 休市/过期标注。
 */
import { useCallback, useEffect, useState } from 'react'
import { MARKET_REMOTE } from './remote.js'
import { NS, en, zh } from './locales.js'

export const inject = ['slots', 'remote', 'locale', 'sidebarRightTabs', 'sidebarRight']

const MARKET_ID = 'dsh-plugin-market-watch'
const MARKET_KIND = 'market'
const RED = '#E5484D'
const GREEN = '#12B76A'

function pctColor(p: number, riseColor: string = 'red'): string {
  // riseColor='green' 表示绿涨红跌(反转);默认红涨绿跌
  const redUp = riseColor !== 'green'
  if (p >= 0) return redUp ? RED : GREEN
  return redUp ? GREEN : RED
}

const TYPE_LABEL: Record<string, string> = {
  stock: '股票',
  index: '指数',
  fund: '基金',
  other: '其他',
}

/** 常驻迷你条(FR-UI-02):自选前 3 标的 + 总收益率;点击打开行情 tab。 */
function MiniBar(props: any) {
  const [data, setData] = useState<{
    items: any[]
    totalRate: number | null
    riseColor: string
    alertsUnread: number
  } | null>(null)

  const reload = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return // FR-UI-07:不可见暂停
    try {
      const q = (await props.fetchQuotes()) as {
        items: any[]
        riseColor?: string
        settings?: { miniBarSymbols?: string[]; alertsUnread?: number }
      }
      const h = (await props.fetchHoldings()) as { items: any[] }
      const holdingItems = h.items.filter((i) => !i.isClosed)
      const totalCost = holdingItems.reduce((s, i) => s + (i.costPrice ?? i.costNav ?? 0) * (i.shares ?? 0), 0)
      const totalValue = holdingItems.reduce((s, i) => s + (i.marketValue ?? 0), 0)
      // 迷你条标的配置生效(FR-UI-05):设置过 miniBarSymbols 则按其选取,否则取自选前 3
      const pref: string[] = q.settings?.miniBarSymbols ?? []
      const norm = (p: string) => p.trim().toLowerCase().replace(/^(sh|sz|bj|hk|gb|usr|nf|hf)_/, '')
      const chosen = pref.length
        ? pref
            .map((p) => q.items.find((i) => i.symbol === p || i.symbol.split(':')[1] === norm(p)))
            .filter(Boolean)
        : q.items.slice(0, 3)
      setData({
        items: chosen,
        totalRate: holdingItems.length > 0 && totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : null,
        riseColor: q.riseColor ?? 'red',
        alertsUnread: q.settings?.alertsUnread ?? 0,
      })
    } catch {
      /* 静默:迷你条不打扰 */
    }
  }, [props.fetchQuotes, props.fetchHoldings])

  useEffect(() => {
    void reload()
    const t = setInterval(() => void reload(), 10000)
    const vis = () => void reload()
    document.addEventListener('visibilitychange', vis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [reload])

  const open = () => {
    try {
      props.open?.()
    } catch {
      /* 无会话时 openTab 静默失败(见 verification.md §10) */
    }
  }

  const pill: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '2px 10px',
    fontSize: 12,
    cursor: 'pointer',
    borderRadius: 999,
    background: 'rgba(128,128,128,0.14)',
    fontVariantNumeric: 'tabular-nums',
  }

  if (data === null) {
    return (
      <div style={pill} onClick={open} title={props.t('mini.loaded')}>
        📈 market-watch
      </div>
    )
  }
  return (
    <div style={pill} onClick={open} title={props.t('mini.open')}>
      <span>📈</span>
      {data.alertsUnread > 0 && (
        <span title="有提醒触发,详见对话中 alert_list" style={{ color: RED, fontWeight: 600 }}>
          🔔{data.alertsUnread}
        </span>
      )}
      {data.items.length === 0 ? (
        <span style={{ opacity: 0.7 }}>{props.t('mini.none')}</span>
      ) : (
        data.items.map((it) => (
          <span key={it.symbol} style={{ display: 'inline-flex', gap: 4 }}>
            <span style={{ fontWeight: 600 }}>{it.name}</span>
            <span>{it.price > 0 ? it.price : '—'}</span>
            <span style={{ color: pctColor(it.changePercent, data.riseColor) }}>
              {it.changePercent >= 0 ? '+' : ''}
              {it.changePercent.toFixed(2)}%
            </span>
          </span>
        ))
      )}
      {data.totalRate !== null && (
        <span style={{ borderTop: '1px solid rgba(128,128,128,0.3)', paddingLeft: 8 }}>
          {props.t('mini.total')}
          <span style={{ color: pctColor(data.totalRate, data.riseColor), marginLeft: 2 }}>
            {data.totalRate >= 0 ? '+' : ''}
            {data.totalRate.toFixed(2)}%
          </span>
        </span>
      )}
    </div>
  )
}

/** 详情视图(FR-UI-04 精简版):K线 SVG 折线(零依赖)+ 基金历史净值。 */
function DetailView(props: any) {
  const [bars, setBars] = useState<any[] | null>(null)
  const [navs, setNavs] = useState<any[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        if (props.isFund) {
          const h = (await props.fetchFundHistory(props.symbol.split(':')[1], 20)) as unknown as {
            list?: any[]
          }
          if (alive) setNavs(h.list ?? [])
        } else {
          const k = (await props.fetchKline(props.symbol, 22)) as unknown as { bars?: any[] }
          if (alive) setBars(k.bars ?? [])
        }
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [props.symbol, props.isFund, props.fetchKline, props.fetchFundHistory])

  if (err) return <div style={{ padding: '4px 10px', fontSize: 11, opacity: 0.7 }}>{err}</div>

  // K线 SVG 折线(收盘价,零依赖,FR-UI-04)
  const line = (points: number[], w: number, h: number, color: string) => {
    if (points.length < 2) return null
    const min = Math.min(...points)
    const max = Math.max(...points)
    const span = max - min || 1
    const step = w / (points.length - 1)
    const d = points.map((p, i) => `${(i * step).toFixed(1)},${(h - ((p - min) / span) * h).toFixed(1)}`).join(' ')
    return (
      <polyline points={d} fill="none" stroke={color} strokeWidth="1.5" />
    )
  }

  if (props.isFund) {
    return (
      <div style={{ padding: '4px 10px 8px', fontSize: 11 }}>
        {navs === null ? (
          <span style={{ opacity: 0.6 }}>{props.t('loading')}</span>
        ) : (
          <table style={{ fontSize: 11, borderCollapse: 'collapse' }}>
            <tbody>
              {navs.slice(0, 10).map((n: any) => (
                <tr key={n.date}>
                  <td style={{ paddingRight: 10, opacity: 0.7 }}>{n.date}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{n.nav}</td>
                  <td style={{ color: pctColor(n.changePercent, 'red'), paddingLeft: 8, fontVariantNumeric: 'tabular-nums' }}>
                    {n.changePercent >= 0 ? '+' : ''}
                    {n.changePercent.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: '4px 10px 8px' }}>
      {bars === null ? (
        <span style={{ fontSize: 11, opacity: 0.6 }}>{props.t('loading')}</span>
      ) : err ? (
        <span style={{ fontSize: 11, opacity: 0.7 }}>{err}</span>
      ) : (
        <svg viewBox="0 0 200 60" width="100%" height="60">
          {line(bars.map((b) => b.close), 200, 56, pctColor(bars[bars.length - 1]!.close - bars[0]!.close, 'red'))}
        </svg>
      )}
      <div style={{ fontSize: 10, opacity: 0.6 }}>
        {bars?.length ?? 0} bars · 近 1 个月(前复权)
      </div>
    </div>
  )
}

function MarketBody(props: any) {
  const t: (k: string) => string = props.t
  const [items, setItems] = useState<any[] | null>(null)
  const [groups, setGroups] = useState<any[]>([])
  const [sortMode, setSortModeState] = useState<string>('default')
  const [riseColor, setRiseColor] = useState<string>('red')
  const [settings, setSettingsState] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<any[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [newGroupName, setNewGroupName] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return // FR-UI-07:不可见暂停
    try {
      const r = await props.fetchQuotes()
      setItems(r.items)
      setGroups(r.groups ?? [])
      setSortModeState(r.sortMode ?? 'default')
      setRiseColor(r.riseColor ?? 'red')
      setSettingsState(r.settings ?? null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [props.fetchQuotes])

  const intervalMs = settings?.intervalMs ?? 5000
  useEffect(() => {
    void reload()
    const t2 = setInterval(() => void reload(), intervalMs)
    const vis = () => void reload() // 恢复可见时立即刷新
    document.addEventListener('visibilitychange', vis)
    return () => {
      clearInterval(t2)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [reload, intervalMs])

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
    const t2 = setTimeout(() => void doSearch(query), 400)
    return () => clearTimeout(t2)
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

  /** 设置改动立即生效(审查修复:此前延迟一个轮询周期)。 */
  const applySettings = async (patch: Record<string, unknown>) => {
    await props.updateSettings(patch)
    await reload()
  }

  const createGroup = async () => {
    const name = newGroupName.trim()
    if (!name) return
    setBusy('newgroup')
    try {
      await props.createGroup(name)
      setNewGroupName('')
      await reload()
    } finally {
      setBusy(null)
    }
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

  if (error) {
    return (
      <div style={{ padding: 14, fontSize: 13, opacity: 0.8 }}>
        {t('err.load')}
        {error}
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
        <span style={{ fontWeight: 600, fontSize: 12, opacity: 0.7 }}>{t('wl.title')}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            style={ghostBtn}
            title="default → asc → desc"
            onClick={() => void cycleSort()}
          >
            {t(`wl.sort.${sortMode}`)}
          </button>
          <button style={ghostBtn} onClick={() => setShowSearch((v) => !v)}>
            {showSearch ? t('wl.collapse') : t('wl.add')}
          </button>
          <button style={ghostBtn} title={t('set.title')} onClick={() => setShowSettings((v) => !v)}>
            ⚙
          </button>
        </div>
      </div>

      {showSearch && (
        <div style={{ padding: '4px 10px', borderBottom: '1px solid rgba(128,128,128,0.15)' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.ph')}
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
          {busy === 'search' && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>{t('search.doing')}</div>}
          {candidates !== null && candidates.length === 0 && !busy && (
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>{t('search.none')}</div>
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
                {busy === c.symbol ? '…' : t('wl.add').replace('＋ ', '')}
              </button>
            </div>
          ))}
        </div>
      )}

      {items === null ? (
        <div style={{ padding: 14, fontSize: 13, opacity: 0.6 }}>{t('loading')}</div>
      ) : items.length === 0 ? (
        <div style={{ padding: 14, fontSize: 13, opacity: 0.7 }}>{t('empty')}</div>
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
                    <div key={it.symbol}>
                    <div
                      style={{ ...rowStyle, cursor: 'pointer' }}
                      onClick={() => setExpanded((v) => (v === it.symbol ? null : it.symbol))}
                    >
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
                          {it.isFund ? (
                            <span style={{ opacity: 0.55, fontWeight: 400 }} title="估值延迟约2分钟">
                              {t('fund.estimate')}
                            </span>
                          ) : null}
                          {it.stale ? (
                            <span style={{ opacity: 0.55, fontWeight: 400 }}>{t('stale')}</span>
                          ) : null}
                          {it.status === 'closed' ? (
                            <span style={{ opacity: 0.55, fontWeight: 400 }}>{t('closed')}</span>
                          ) : null}
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
                              color: pctColor(it.changePercent, riseColor),
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
                          title={it.pinned ? 'unpin' : 'pin'}
                          disabled={busy !== null}
                          onClick={() => void togglePin(it.symbol, !it.pinned)}
                        >
                          📌
                        </button>
                        <select
                          value={it.groupId}
                          title={t('move') ?? 'move'}
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
                              {nameOf(g2.id)}
                            </option>
                          ))}
                        </select>
                        <button
                          style={ghostBtn}
                          title="✕"
                          disabled={busy !== null}
                          onClick={(e) => {
                            e.stopPropagation() // 不触发行点击(详情展开)
                            void remove(it.symbol)
                          }}
                        >
                          {busy === it.symbol ? '…' : '✕'}
                        </button>
                      </div>
                    </div>
                    {expanded === it.symbol && (
                      <DetailView
                        symbol={it.symbol}
                        isFund={it.isFund}
                        fetchKline={props.fetchKline}
                        fetchFundHistory={props.fetchFundHistory}
                        t={t}
                      />
                    )}
                  </div>
                ))}
              </div>
            )
          })
      )}

      {showSettings && settings && (
        <div style={{ padding: '10px', borderTop: '2px solid rgba(128,128,128,0.25)', fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('set.title')}</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            {t('set.interval')}
            <input
              type="number"
              min={3}
              max={60}
              value={Math.round(settings.intervalMs / 1000)}
              onChange={(e) => {
                const sec = Number(e.target.value)
                if (sec >= 3 && sec <= 60) void applySettings({ intervalMs: sec * 1000 })
              }}
              style={{ width: 60, background: 'transparent', color: 'inherit', border: '1px solid rgba(128,128,128,0.35)', borderRadius: 4 }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <input
              type="checkbox"
              checked={riseColor === 'green'}
              onChange={(e) => void applySettings({ riseColor: e.target.checked ? 'green' : 'red' })}
            />
            {t('set.invert')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <input
              type="checkbox"
              checked={settings.privacy.exposeAmounts}
              onChange={(e) => void applySettings({ privacy: { exposeAmounts: e.target.checked } })}
            />
            {t('set.privacy')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <input
              type="checkbox"
              checked={settings.alertsEnabled}
              onChange={(e) => void applySettings({ alertsEnabled: e.target.checked })}
            />
            {t('set.alerts')}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder={t('set.newgroup')}
              disabled={busy !== null}
              style={{ flex: 1, background: 'transparent', color: 'inherit', border: '1px solid rgba(128,128,128,0.35)', borderRadius: 4, padding: '3px 6px' }}
            />
            <button style={ghostBtn} disabled={busy !== null || !newGroupName.trim()} onClick={() => void createGroup()}>
              {busy === 'newgroup' ? '…' : t('set.create')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function apply(ctx: any): void {
  const t: (k: string) => string = ctx.locale.bind(NS)

  // i18n 字典注册(FR-UI-08)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'market-watch: dictionaries')

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
  const fetchHoldings = async () => call('getHoldings') as Promise<{ items: any[] }>

  // 阶段一:注册 tab 类型 + 侧栏引导页入口盒(点击即打开 tab)
  ctx.effect(
    () =>
      ctx.sidebarRightTabs.register({
        id: MARKET_ID,
        kind: MARKET_KIND,
        priority: 'extension',
        title: () => t('tab.title'),
        guide: [
          {
            id: 'market-guide-entry',
            order: 50,
            title: () => t('tab.title'),
            description: () => t('guide.desc'),
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
              createGroup: (name: string) => call('createGroup', name),
              updateSettings: (patch: Record<string, unknown>) => call('updateSettings', patch),
              fetchKline: (symbol: string, days: number) => call('getKline', symbol, days) as Promise<any[]>,
              fetchFundHistory: (code: string, days: number) => call('getFundHistory', code, days) as Promise<any[]>,
              t,
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
          <span>{t('tab.title')}</span>
        )),
      ),
    'market-watch: tab title',
  )

  // 迷你条(FR-UI-02):shell.overlay(M0 实测可用挂载点)
  ctx.effect(
    () =>
      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          {
            name: 'shell.overlay',
            id: MARKET_ID,
            order: 10,
            inject: () => ({ fetchQuotes, fetchHoldings, t, open: () => ctx.sidebarRight.openTab(MARKET_KIND) }),
          },
          (props: any) => <MiniBar {...props} />,
        ),
      ),
    'market-watch: mini bar',
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
              title={t('mini.open')}
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

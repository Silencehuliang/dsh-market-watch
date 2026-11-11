// @vitest-environment jsdom
/**
 * Client DOM smoke 测试(#38):覆盖评审/实机发现的两个客户端 bug 类别——
 * 迷你条渲染与点击链路、K 线空数据空态。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DetailView, MiniBar } from '../../src/client/index'

afterEach(() => cleanup())

const t = (k: string): string =>
  (({
    'mini.total': '总收益',
    'mini.open': '打开行情侧栏',
    'mini.none': '无自选',
    'mini.loaded': '已加载',
    'fx.missing': '部分持仓汇率缺失,金额未折算',
    loading: '加载中…',
    'kline.empty': '暂无K线数据',
  }) as Record<string, string>)[k] ?? k

describe('MiniBar(#38 DOM smoke)', () => {
  it('渲染标的行情、宿主侧总收益率与未读角标', async () => {
    const fetchQuotes = vi.fn(async () => ({
      items: [{ symbol: 'cn_sh:600519', name: '贵州茅台', price: 1439, changePercent: -0.41 }],
      riseColor: 'red',
      settings: { alertsUnread: 2, miniBarSymbols: [] },
    }))
    const fetchHoldings = vi.fn(async () => ({
      items: [{ symbol: 'cn_sh:600519', profitRate: 3.45, isClosed: false }],
      totalProfitRate: 5.5, // #37:宿主侧计算,隐私模式同样有值
    }))
    render(
      <MiniBar
        fetchQuotes={fetchQuotes}
        fetchHoldings={fetchHoldings}
        t={t}
        open={() => {}}
        ackAlerts={() => {}}
      />,
    )
    await waitFor(() => expect(screen.getByText('贵州茅台')).toBeTruthy())
    expect(screen.getByText('+5.50%')).toBeTruthy() // 宿主 totalProfitRate 直出
    expect(screen.getByText('🔔2')).toBeTruthy()
  })

  it('点击打开面板并异步 ack(回归:ackAlerts 无远端方法曾吞掉 open)', async () => {
    const open = vi.fn()
    const ackAlerts = vi.fn(async () => ({ ok: true, symbol: '' }))
    const fetchQuotes = vi.fn(async () => ({
      items: [{ symbol: 'hk:00700', name: '腾讯控股', price: 417.8, changePercent: -0.14 }],
      riseColor: 'red',
      settings: { alertsUnread: 0, miniBarSymbols: [] },
    }))
    const fetchHoldings = vi.fn(async () => ({ items: [], totalProfitRate: null }))
    render(
      <MiniBar
        fetchQuotes={fetchQuotes}
        fetchHoldings={fetchHoldings}
        t={t}
        open={open}
        ackAlerts={ackAlerts}
      />,
    )
    await waitFor(() => expect(screen.getByText('腾讯控股')).toBeTruthy())
    fireEvent.click(screen.getByTitle('打开行情侧栏'))
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(ackAlerts).toHaveBeenCalledTimes(1)) // open 先行,ack 异步
  })

  it('汇率缺失时总收益率旁显示 ≈ 提示', async () => {
    const fetchQuotes = vi.fn(async () => ({
      items: [{ symbol: 'us:AAPL.OQ', name: '苹果', price: 200, changePercent: 1 }],
      riseColor: 'red',
      settings: { alertsUnread: 0, miniBarSymbols: [] },
    }))
    const fetchHoldings = vi.fn(async () => ({
      items: [{ symbol: 'us:AAPL.OQ', profitRate: 11.11, isClosed: false, fxMissing: true }],
      totalProfitRate: 11.11,
    }))
    render(
      <MiniBar
        fetchQuotes={fetchQuotes}
        fetchHoldings={fetchHoldings}
        t={t}
        open={() => {}}
        ackAlerts={() => {}}
      />,
    )
    await waitFor(() => expect(screen.getByText('≈')).toBeTruthy())
    expect((screen.getByText('≈') as HTMLElement).title).toContain('汇率缺失')
  })
})

describe('DetailView(#38 DOM smoke)', () => {
  it('空 K 线显示空态,不崩溃(回归:bars[-1].close TypeError)', async () => {
    const fetchKline = vi.fn(async () => ({ symbol: 'cn_sh:600519', bars: [] }))
    render(<DetailView symbol="cn_sh:600519" isFund={false} fetchKline={fetchKline} t={t} />)
    await waitFor(() => expect(screen.getByText('暂无K线数据')).toBeTruthy())
  })

  it('有数据时渲染 SVG 折线', async () => {
    const fetchKline = vi.fn(async () => ({
      symbol: 'cn_sh:600519',
      bars: [
        { date: '2026-11-17', open: 1490, close: 1500, high: 1505, low: 1485, volume: 100 },
        { date: '2026-11-18', open: 1500, close: 1510, high: 1512, low: 1498, volume: 120 },
      ],
    }))
    const { container } = render(
      <DetailView symbol="cn_sh:600519" isFund={false} fetchKline={fetchKline} t={t} />,
    )
    await waitFor(() => expect(container.querySelector('svg polyline')).toBeTruthy())
  })
})

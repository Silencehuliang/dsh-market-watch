# dsh-market-watch

**Agent-enhanced market watch plugin for DeepSeek Harness (dsh)** — persistent watchlist sidebar, portfolio P&L ledger, price alerts, and daily scheduled briefings; the same data is exposed to the model as 26 agent tools.

> Positioning: not the heaviest UI, but the one that best knows *when the agent should speak* — daily automatic briefings across your whole watchlist/portfolio, news flashes correlated with your holdings, and a deliberately restrained panel.

Data comes from free public endpoints (Sina / Tencent / Eastmoney / Jin10). It may be delayed, inaccurate, or unavailable at any time. **Not investment advice.**

[中文文档](./README.md) · See [CHANGELOG.md](./CHANGELOG.md)

## Features

- **Watchlist sidebar** — groups (A-shares / HK / US / others), three-state sort (custom order with pinning / % change asc / desc), inline K-line detail
- **Mini bar** — 1–3 persistent tickers plus total portfolio return
- **Markets** — A-shares, HK, US stocks, funds, futures (CN/global), FX; level-1 order book (`bid1`/`ask1`) and order-book ratio for A/HK/US
- **Portfolio ledger** — shares/cost entry, day & cumulative P&L, return rate; HK/US converted to CNY (5-min FX cache)
- **Alerts** — price / % change threshold crossing; evaluated **only during market hours**, 3-minute per-rule throttle, host-side 5s timer (works without UI); unread badge; optional webhook push (off by default)
- **Briefings** — `brief_schedule` daily pre-open 09:15 / post-close 15:10 (Asia/Shanghai); closed days auto-skipped via the CN trading calendar
- **News** — Jin10 flash list with keyword filter and 60s cache, interpreted by the model against your watchlist
- **Money flow** — southbound Stock Connect net buy, northbound total turnover (net-buy disclosure ended 2024-08 → structured `unavailable`), sector & concept rankings
- **Share card** — SVG P&L ranking with amounts **always hidden**
- **Import/export** — versioned JSON of watchlist/holdings/alerts/settings; **masked by default** (amounts/shares/cost & webhook URL never enter model context unless `full: true`)

Engineering notes: UI polling pauses when the page is hidden; all network requests happen host-side (Node) only; all charts are zero-dependency SVG.

## Install

```bash
# dsh Web CLI (must pass --profile)
dsh plugin --profile web add dsh-plugin-market-watch

# Desktop: enter the npm package name in the plugin manager
```

Then: add watchlist items via search or a chat command, enter positions, and say “每天收盘后给我一份简报” to create the daily briefing.

## Agent tools (26)

All outputs carry `asOf` / `source` / `delayed` markers.

- **market_**: `market_quote` (batch quotes incl. bid1/ask1/orderBookRatio), `market_fund_estimate`, `market_search`, `market_kline` (qfq, json/csv), `market_fund_history`, `market_flow` (north=total-turnover note / south=net buy / sector / concept), `market_news_flash`, `market_fund_rank`, `market_status` (per-market session status + next open), `market_diagnostics` (source health: last error/latency/cooldown), `market_export` (masked unless `full: true`) / `market_import`, `market_watch_hello`
- **watchlist_**: `watchlist_add` / `watchlist_list` / `watchlist_remove` (idempotent)
- **holdings_**: `holdings_set` (fund amount→shares reverse-calc via cost NAV), `holdings_get` (privacy mode returns percentages only), `portfolio_summary` (aggregate P/L, distribution, max swing — privacy-aware)
- **alert_**: `alert_set` / `alert_list` / `alert_delete` / `alert_ack`
- **brief_**: `brief_generate` (pre_open/post_close, closed-day short-circuit), `brief_schedule` (via `ctx.schedule`, bound to the creating session)
- **share_card**: SVG earnings ranking (percentages only)

Symbols use `{market}:{code}` — e.g. `cn_sh:600519`, `hk:00700`, `us:AAPL`, `fund:110022`, `fut_cn:IF0`, `fx:susdcny`.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| `intervalMs` | 5000 | 3–60s; auto-pauses when hidden |
| `riseColor` | `red` | invertible |
| `privacy.exposeAmounts` | `false` | amounts/shares/cost never enter model context when off |
| `sortMode` | `default` | custom( pinned first) / asc / desc |
| `alertsEnabled` | `true` | host-side timer, UI-independent |
| `miniBarSymbols` | — | 1–3 persistent tickers |
| `webhookUrl` | — | off unless set; stored locally only |

## Reliability

Single reliable source + cache fallback (ADR-0001): on failure (HTTP 429/403, timeout, parse errors) the source enters a flat 60s cooldown during which only cache is served; stale cached values are served and clearly marked (`stale`); closed markets trigger no high-frequency polling (built-in 2026 CN holiday table).

## Privacy

Amounts/shares/cost are hidden from model context by default; watchlist names are not hidden (ADR-0002). The share card hides amounts unconditionally. `market_export` is **masked by default**; full data (incl. amounts and the webhook URL) requires the explicit `full: true` flag — pass it only when the user explicitly asks to migrate/backup amounts. The plugin reads no host credentials; outbound requests are limited to the data sources above, host-side only.

## Known limitations

- Free endpoints have no SLA and may rate-limit, change, or disappear (see Reliability);
- Trading calendar is a built-in 2026 CN holiday table, needs a yearly update;
- Futures/FX symbols land in the “Other” group;
- The mini bar's total portfolio return needs amounts to weight, so it stays hidden under the default privacy mode;
- Free search matches bare codes/names: queries like `usAAPL` (market-prefixed) return nothing.

## Compatibility

| Component | Requirement | Verified |
| --- | --- | --- |
| Node | >= 22 | 22.19+ |
| dsh CLI / host | `0.2.1-rc.3` | `0.2.1-rc.3` |
| dsh desktop | npm install in plugin manager | pending (see CHANGELOG) |

## Disclaimer

Data from free public endpoints may be delayed, inaccurate, or unavailable at any time. For personal reference only; **not investment advice**. Trade at your own risk.

## Development

```bash
npm install
npm test          # vitest, 190+ tests (incl. offline integration); providers fully fixture-mocked, CI is offline
npm run build     # esbuild bundle + tsc
MW_LIVE=1 npx vitest run tests/live   # live tests against real data sources
dsh --profile web --patch ./cordis.patch.yml   # local load
```

Docs: `docs/spec.md`, SRS, `docs/architecture.md`, `docs/adr/`, `docs/verification.md`, `GLOSSARY.md`.

## License

MIT

import { fetchSinaStocks } from '../dist/core/providers/sina.js'
import { normalizeSymbol } from '../dist/core/symbol.js'
import { QuoteService } from '../dist/core/quote-service.js'

const svc = new QuoteService(fetchSinaStocks)
const symbols = ['sh600519', 'sz000001', 'sh000001'].map((s) => normalizeSymbol(s))
const quotes = await svc.getQuotes(symbols)
console.log(JSON.stringify(quotes, null, 2))
console.log('diagnostics:', svc.diagnostics())

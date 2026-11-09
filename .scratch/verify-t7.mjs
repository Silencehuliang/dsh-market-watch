import { fetchFundEstimates } from '../dist/core/providers/eastmoney.js'
const estimates = await fetchFundEstimates(['110022', '161725'])
console.log(JSON.stringify(estimates, null, 2))

const tokenDataQuery = `
    query ($network: EthereumNetwork!, $token: String!, $from: ISO8601DateTime, $till: ISO8601DateTime) {
        ethereum(network: $network) {
            transfers(
                currency: {is: $token}
                date: {since: $from, till: $till}
            ) {
                currency {
                    name
                    symbol
                    decimals
                }
                amount
                count
                volumeUSD: amount(calculate: sum, in: USD)
                firstTransaction: minimum(of: block)
                transactions: count
            }
            dexTrades(
                baseCurrency: {is: $token}
            ) {
                tradeAmount(in: USD)
                liquidity: maximum(of: quote_price, get: quote_price)
            }
        }
    }
`;

const timeBasedMetricsQuery = `
    query ($network: EthereumNetwork!, $token: String!, $from: ISO8601DateTime) {
        ethereum(network: $network) {
            dexTrades(
                baseCurrency: {is: $token}
                time: {since: $from}
            ) {
                volumeUSD: tradeAmount(in: USD)
                transactions: count
            }
        }
    }
`;

module.exports = {
    tokenDataQuery,
    timeBasedMetricsQuery
}; 
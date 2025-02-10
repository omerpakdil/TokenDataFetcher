const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const { GraphQLClient } = require('graphql-request');
const { ethers } = require('ethers');
const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const NodeCache = require('node-cache');
const axios = require('axios');
const { tokenDataQuery, timeBasedMetricsQuery } = require('./queries/bitquery');
const { ERC20_ABI } = require('./constants/abi');

class TokenDataFetcher {
    constructor(config = {}) {
        const solanaRpcUrl = config.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
        this.cache = new NodeCache({ stdTTL: 300 });
        this.bitqueryClient = new GraphQLClient(
            'https://graphql.bitquery.io',
            {
                headers: {
                    'Authorization': `Bearer ${process.env.BITQUERY_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        this.coingeckoClient = axios.create({
            baseURL: 'https://api.coingecko.com/api/v3',
            timeout: 30000,
            headers: {
                'Accept': 'application/json'
            }
        });
        this.supportedChains = {
            ethereum: {
                rpc: config.ethRpcUrl || process.env.ETH_RPC_URL,
                provider: null,
                coingeckoId: 'ethereum'
            },
            bsc: {
                rpc: config.bscRpcUrl || process.env.BSC_RPC_URL,
                provider: null,
                coingeckoId: 'binance-smart-chain'
            },
            polygon: {
                rpc: config.polygonRpcUrl || process.env.POLYGON_RPC_URL,
                provider: null,
                coingeckoId: 'polygon-pos'
            },
            avalanche: {
                rpc: config.avalancheRpcUrl || process.env.AVALANCHE_RPC_URL,
                provider: null,
                coingeckoId: 'avalanche'
            },
            solana: {
                rpc: solanaRpcUrl,
                connection: null,
                coingeckoId: 'solana'
            }
        };

        this.initializeProviders();
    }

    initializeProviders() {
        if (this.supportedChains.ethereum?.rpc) {
            this.supportedChains.ethereum.provider = new ethers.JsonRpcProvider(
                this.supportedChains.ethereum.rpc
            );
        }
        const solanaUrl = this.supportedChains.solana?.rpc;
        const formattedSolanaUrl = solanaUrl.startsWith('http') 
            ? solanaUrl 
            : `https://${solanaUrl}`;
        this.supportedChains.solana.connection = new Connection(formattedSolanaUrl);
    }

    async getTokenData(tokenAddress, chain = 'ethereum') {
        try {
            const cacheKey = `${chain}-${tokenAddress}`;
            const cachedData = this.cache.get(cacheKey);
            
            if (cachedData) return cachedData;

            const data = await this._fetchTokenData(tokenAddress, chain);
            this.cache.set(cacheKey, data);
            
            return data;
        } catch (error) {
            console.error(`Error fetching token data: ${error.message}`);
            throw error;
        }
    }

    async _fetchTokenData(tokenAddress, chain) {
        const basicData = await this._fetchBitqueryData(tokenAddress, chain);
        const coingeckoData = await this._fetchCoingeckoData(tokenAddress, chain);
        const holdersCount = await this._fetchHoldersCount(tokenAddress, chain);
        
        const finalPrice = (!basicData.price || Number.isNaN(basicData.price)) 
            ? coingeckoData.price 
            : basicData.price;
        const finalMarketCap = (basicData.marketCap && basicData.marketCap !== 0) 
            ? basicData.marketCap 
            : coingeckoData.marketCap;
        
        const finalLiquidity = (typeof basicData.liquidity === 'number' && basicData.liquidity > 0)
            ? basicData.liquidity
            : (typeof coingeckoData.liquidity === 'number' && coingeckoData.liquidity > 0 
                ? coingeckoData.liquidity 
                : 0);
        
        console.log("Launch date value from Bitquery:", basicData.launchDate);
        
        let formattedLaunchDate = null;
        if (basicData.launchDate) {
            const launchVal = basicData.launchDate.toString();
            
            try {
                const provider = this.supportedChains.ethereum?.provider;
                if (provider) {
                    const block = await provider.getBlock(parseInt(launchVal));
                    if (block && block.timestamp) {
                        formattedLaunchDate = new Date(block.timestamp * 1000).toISOString();
                    }
                }
            } catch (error) {
                console.warn("Error fetching block timestamp for launchDate:", error.message);
            }
        }

        return {
            address: tokenAddress,
            name: basicData.name || coingeckoData.name,
            symbol: basicData.symbol || coingeckoData.symbol,
            price: finalPrice,
            marketCap: finalMarketCap,
            liquidity: finalLiquidity,
            volume: {
                "6h": basicData.volume6h,
                "12h": basicData.volume12h,
                "24h": basicData.volume24h,
                "48h": basicData.volume48h,
                "7d": basicData.volume7d,
                "30d": basicData.volume30d
            },
            transactions: {
                "6h": basicData.tx6h,
                "12h": basicData.tx12h,
                "24h": basicData.tx24h,
                "48h": basicData.tx48h,
                "7d": basicData.tx7d,
                "30d": basicData.tx30d
            },
            holders: holdersCount,
            launchDate: formattedLaunchDate 
        };
    }

    async _fetchBitqueryData(tokenAddress, chain) {
        try {
            if (!process.env.BITQUERY_API_KEY) {
                throw new Error('Bitquery API key not found');
            }

            const now = new Date();
            const timeframes = {
                '6h': new Date(now - 6 * 60 * 60 * 1000),
                '12h': new Date(now - 12 * 60 * 60 * 1000),
                '24h': new Date(now - 24 * 60 * 60 * 1000),
                '48h': new Date(now - 48 * 60 * 60 * 1000),
                '7d': new Date(now - 7 * 24 * 60 * 60 * 1000),
                '30d': new Date(now - 30 * 24 * 60 * 60 * 1000)
            };

            const basicData = await this.bitqueryClient.request(
                tokenDataQuery,
                {
                    network: this._getNetworkName(chain),
                    token: tokenAddress,
                    from: timeframes['30d'].toISOString(),
                    till: now.toISOString()
                }
            );

            const timeMetrics = await Promise.all(
                Object.entries(timeframes).map(async ([period, fromDate]) => {
                    const metrics = await this.bitqueryClient.request(timeBasedMetricsQuery, {
                        network: this._getNetworkName(chain),
                        token: tokenAddress,
                        from: fromDate.toISOString()
                    });
                    return [period, metrics.ethereum.dexTrades[0]];
                })
            );

            const tokenInfo = basicData.ethereum.transfers[0]?.currency || {};
            const dexInfo = basicData.ethereum.dexTrades[0] || {};

            const volumes = {};
            const transactions = {};
            timeMetrics.forEach(([period, metrics]) => {
                volumes[period] = metrics?.volumeUSD || 0;
                transactions[period] = metrics?.transactions || 0;
            });

            let liquidityValue = dexInfo.liquidity;
            if (liquidityValue === null && dexInfo.tradeAmount && dexInfo.baseAmount) {
                liquidityValue = dexInfo.tradeAmount / dexInfo.baseAmount;
            }

            return {
                name: tokenInfo.name || '',
                symbol: tokenInfo.symbol || '',
                price: dexInfo.tradeAmount ? (dexInfo.tradeAmount / dexInfo.baseAmount) : 0,
                marketCap: this._calculateMarketCap(tokenInfo.totalSupply, dexInfo.lastPrice),
                liquidity: liquidityValue || 0,
                volume6h: volumes['6h'],
                volume12h: volumes['12h'],
                volume24h: volumes['24h'],
                volume48h: volumes['48h'],
                volume7d: volumes['7d'],
                volume30d: volumes['30d'],
                tx6h: transactions['6h'],
                tx12h: transactions['12h'],
                tx24h: transactions['24h'],
                tx48h: transactions['48h'],
                tx7d: transactions['7d'],
                tx30d: transactions['30d'],
                launchDate: basicData.ethereum.transfers[0]?.firstTransaction || null
            };
        } catch (error) {
            console.error('Bitquery API Error:', error.message);
            throw new Error(`Error fetching Bitquery data: ${error.message}`);
        }
    }

    _getNetworkName(chain) {
        const networkMap = {
            'ethereum': 'ethereum',
            'bsc': 'bsc',
            'polygon': 'matic',
            'avalanche': 'avalanche',
            'arbitrum': 'arbitrum',
            'optimism': 'optimism'
        };
        return networkMap[chain.toLowerCase()] || 'ethereum';
    }

    _calculateMarketCap(totalSupply, price) {
        if (!totalSupply || !price) return 0;
        return (parseFloat(totalSupply) * parseFloat(price));
    }

    async _fetchCoingeckoData(tokenAddress, chain) {
        try {
            const chainId = this.supportedChains[chain]?.coingeckoId;
            if (!chainId) {
                throw new Error(`Unsupported blockchain: ${chain}`);
            }

            const response = await this.coingeckoClient.get(
                `/coins/${chainId}/contract/${tokenAddress.toLowerCase()}`,
                {
                    params: {
                        localization: false,
                        tickers: true,
                        market_data: true,
                        community_data: false,
                        developer_data: false
                    }
                }
            );

            const data = response.data;

            return {
                name: data.name || '',
                symbol: data.symbol?.toUpperCase() || '',
                price: data.market_data?.current_price?.usd || 0,
                marketCap: data.market_data?.market_cap?.usd || 0,
                totalVolume: data.market_data?.total_volume?.usd || 0,
                priceChangePercentage: {
                    '24h': data.market_data?.price_change_percentage_24h || 0,
                    '7d': data.market_data?.price_change_percentage_7d || 0,
                    '30d': data.market_data?.price_change_percentage_30d || 0
                },
                marketCapRank: data.market_cap_rank || null,
                historicalData: {
                    prices: [],
                    marketCaps: [],
                    totalVolumes: []
                },
                lastUpdated: data.last_updated || null
            };
        } catch (error) {
            console.error('Coingecko fetch error:', error.message);
            if (error.response) {
                console.error('Error Response:', error.response.data);
            }
            return {
                name: '',
                symbol: '',
                price: 0,
                marketCap: 0,
                totalVolume: 0,
                priceChangePercentage: {
                    '24h': 0,
                    '7d': 0,
                    '30d': 0
                },
                marketCapRank: null,
                historicalData: {
                    prices: [],
                    marketCaps: [],
                    totalVolumes: []
                },
                lastUpdated: null
            };
        }
    }

    async _fetchHoldersCount(tokenAddress, chain) {
        try {
            if (chain === 'solana') {
                return await this._fetchSolanaHolders(tokenAddress);
            } else {
                return await this._fetchEVMHolders(tokenAddress, chain);
            }
        } catch (error) {
            console.error(`Error fetching holders count (${chain}):`, error);
            return 0;
        }
    }

    async _fetchEVMHolders(tokenAddress, chain) {
        try {
            const provider = this.supportedChains[chain]?.provider;
            if (!provider) {
                console.error(`Provider not found for ${chain}`);
                return 0;
            }

            const tokenContract = new ethers.Contract(
                tokenAddress,
                [
                    "function balanceOf(address account) view returns (uint256)"
                ],
                provider
            );

            const currentBlock = await provider.getBlockNumber();
            const blockRange = 50;
            const fromBlock = Math.max(currentBlock - blockRange, 0);
            
            const batchSize = 100;
            const concurrentBatches = 5;
            
            const sampleAddresses = [
                '0x000000000000000000000000000000000000dead',
                '0x0000000000000000000000000000000000000000'
            ];

            const batches = [];
            for (let i = 0; i < sampleAddresses.length; i += batchSize) {
                batches.push(sampleAddresses.slice(i, i + batchSize));
            }

            let totalHolders = 0;
            
            for (let i = 0; i < batches.length; i += concurrentBatches) {
                const currentBatches = batches.slice(i, i + concurrentBatches);
                
                const results = await Promise.all(
                    currentBatches.map(async (batch, index) => {
                        try {
                            const balances = await Promise.all(
                                batch.map(address => 
                                    tokenContract.balanceOf(address)
                                        .then(balance => balance > 0n ? 1 : 0)
                                        .catch(() => 0)
                                )
                            );
                            return balances.reduce((a, b) => a + b, 0);
                        } catch (error) {
                            console.error(`Error in batch ${i + index + 1}:`, error.message);
                            return 0;
                        }
                    })
                );
                
                totalHolders += results.reduce((a, b) => a + b, 0);
                
                if (i + concurrentBatches < batches.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            return totalHolders;
        } catch (error) {
            console.error('Error fetching EVM holders:', error);
            return 0;
        }
    }

    async _fetchSolanaHolders(tokenAddress) {
        try {
            const connection = this.supportedChains.solana.connection;
            const mintPubkey = new PublicKey(tokenAddress);

            const tokenAccounts = await connection.getProgramAccounts(
                TOKEN_PROGRAM_ID,
                {
                    filters: [
                        {
                            dataSize: 165,
                        },
                        {
                            memcmp: {
                                offset: 0,
                                bytes: mintPubkey.toBase58(),
                            },
                        },
                    ],
                }
            );

            const activeAccounts = tokenAccounts.filter(account => {
                const accountData = account.account.data;
                const amount = accountData.readBigInt64LE(64);
                return amount > 0;
            });

            return activeAccounts.length;
        } catch (error) {
            console.error('Error fetching Solana holders:', error);
            return 0;
        }
    }
}

module.exports = { TokenDataFetcher };
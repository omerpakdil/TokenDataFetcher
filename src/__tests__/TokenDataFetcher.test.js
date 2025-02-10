const { TokenDataFetcher } = require('../TokenDataFetcher');

describe('TokenDataFetcher', () => {
    let fetcher;

    beforeEach(() => {
        fetcher = new TokenDataFetcher();
    });

    describe('getTokenData', () => {
        it('should fetch token data successfully', async () => {
            // Test token adresi (USDT Ethereum)
            const tokenAddress = '0xdac17f958d2ee523a2206206994597c13d831ec7';
            const chain = 'ethereum';

            const data = await fetcher.getTokenData(tokenAddress, chain);

            expect(data).toBeDefined();
            expect(data.address).toBe(tokenAddress);
            expect(data.name).toBeDefined();
            expect(data.symbol).toBeDefined();
            expect(data.price).toBeGreaterThan(0);
            expect(data.marketCap).toBeGreaterThan(0);
            expect(data.holders).toBeGreaterThan(0);
        });

        it('should handle invalid token address', async () => {
            const invalidAddress = '0xinvalid';
            const chain = 'ethereum';

            await expect(
                fetcher.getTokenData(invalidAddress, chain)
            ).rejects.toThrow();
        });

        it('should handle unsupported chain', async () => {
            const tokenAddress = '0xdac17f958d2ee523a2206206994597c13d831ec7';
            const invalidChain = 'invalid-chain';

            await expect(
                fetcher.getTokenData(tokenAddress, invalidChain)
            ).rejects.toThrow();
        });
    });

    describe('caching', () => {
        it('should return cached data for subsequent calls', async () => {
            const tokenAddress = '0xdac17f958d2ee523a2206206994597c13d831ec7';
            const chain = 'ethereum';

            // İlk çağrı
            const firstCall = await fetcher.getTokenData(tokenAddress, chain);
            
            // İkinci çağrı (önbellekten gelmeli)
            const secondCall = await fetcher.getTokenData(tokenAddress, chain);

            expect(firstCall).toEqual(secondCall);
        });
    });

    describe('_fetchHoldersCount', () => {
        it('should return holder count for EVM chains', async () => {
            const tokenAddress = '0xdac17f958d2ee523a2206206994597c13d831ec7';
            const chain = 'ethereum';

            const holdersCount = await fetcher._fetchHoldersCount(tokenAddress, chain);
            expect(holdersCount).toBeGreaterThan(0);
        });

        it('should return holder count for Solana', async () => {
            const tokenAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC Solana
            const chain = 'solana';

            const holdersCount = await fetcher._fetchHoldersCount(tokenAddress, chain);
            expect(holdersCount).toBeGreaterThan(0);
        });
    });
}); 
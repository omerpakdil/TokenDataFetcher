const { TokenDataFetcher } = require('../TokenDataFetcher');

async function test() {
    try {
        const fetcher = new TokenDataFetcher();
        
        // Just ERC20 tokens for now
        /// Let's test the ethereum token (Ethereum)
        const tokenAddress = '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE';
        const chain = 'ethereum';
        
        console.log('Getting token data...');        
        const tokenData = await fetcher.getTokenData(tokenAddress, chain);
        console.log('Token Data:', JSON.stringify(tokenData, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

test();
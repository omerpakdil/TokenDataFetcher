# Token Data Fetcher

Token Data Fetcher is a Node.js library that fetches real-time token data from various blockchains, including Ethereum, Binance Smart Chain, Polygon, Avalanche, and Solana.

## Installation

1. Clone the repository:
   ```bash
   git clone [repo-url]
   cd token-data-fetcher
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create the environment configuration by copying the example file:
   ```bash
   cp .env.example .env
   ```

4. Update the `.env` file with your API keys and RPC URLs:
   ```env
   # API Keys
   BITQUERY_API_KEY=your_bitquery_api_key
   COINGECKO_API_KEY=your_coingecko_api_key

   # RPC URLs
   ETH_RPC_URL=your_ethereum_rpc_url
   BSC_RPC_URL=your_bsc_rpc_url
   POLYGON_RPC_URL=your_polygon_rpc_url
   AVALANCHE_RPC_URL=your_avalanche_rpc_url
   SOLANA_RPC_URL=your_solana_rpc_url
   ```

## Test

   ```bash
cd src/__tests__/
node test.js
```

# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
pnpm install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
pnpm dev
```

## Production

Build the application for production:

```bash
pnpm build
```

Locally preview production build:

```bash
pnpm preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## API

### Get Token Balances

Get token balances for whitelisted tokens of a selected network for a specific account.

**Endpoint:** `GET /api/token/balances`

**Query Parameters:**
- `wallet_address` (required): The wallet address to query balances for
- `chain_id` (required): The chain ID (1 for Mainnet, 10 for Optimism, 11155111 for Sepolia)

**Example:**
```
http://localhost:3000/api/token/balances?wallet_address=0xb575D9AdfFA49bEf3c512C4c9e0A40ab6782d928&chain_id=10
```

**Response:**
```json
{
  "success": true,
  "message": "Token balances fetched successfully",
  "data": {
    "native_balance": "1000000000000000000",
    "token_balances": [
      {
        "token": {
          "token_type": "ERC20",
          "chain_id": 10,
          "chain": "optimism",
          "address": "0x...",
          "name": "Token Name",
          "symbol": "TKN",
          "image_url": "https://...",
          "publisher_address": "0x...",
          "position": 10,
          "description": "...",
          "decimals": 18
        },
        "balance": "1000000000000000000"
      }
    ]
  }
}
```

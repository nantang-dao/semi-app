export interface TokenMetadata {
  name: string;
  symbol: string;
  address: string;
  icon: string;
  decimals: number;
}

export interface PopularTokenList {
  [chainId: number]: TokenMetadata[];
}

export const POPULAR_ERC20_TOKENS: PopularTokenList = {
  1: [
    // {
    //   name: "Tether USD",
    //   symbol: "USDT",
    //   address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    //   icon: "https://datastore.sola.day/cgqauykb_v936bf9G5",
    //   decimals: 6,
    // },
  ],
  10: [
    {
      name: "NT",
      symbol: "NT",
      address: "0x7563cb33148cD2b929ed85e69F697be13b515Bd0",
      icon: "https://datastore.sola.day/3k3hqrjr__PZV_gRcK",
      decimals: 18,
    },
    {
      name: "WX",
      symbol: "WX",
      address: "0xA72b3c7106a0744d8A81f9FBeaA6312d44A13113",
      icon: "https://datastore.sola.day/mzbn05eg_KhYk9Pxg2",
      decimals: 18,
    },
    // {
    //   name: "Tether USD",
    //   symbol: "USDT",
    //   address: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",
    //   icon: "https://datastore.sola.day/cgqauykb_v936bf9G5",
    //   decimals: 6,
    // },
    // {
    //   name: "USDC",
    //   symbol: "USDC",
    //   address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    //   icon: "https://datastore.sola.day/57yobknk_WoLp8Wvot",
    //   decimals: 6,
    // },
  ],
  11155111: [
    {
      name: "USDC",
      symbol: "Test erc20 token",
      address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      decimals: 6,
      icon: "https://datastore.sola.day/57yobknk_WoLp8Wvot",
    },
  ],
};

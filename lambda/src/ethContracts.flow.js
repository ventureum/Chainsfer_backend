// @flow

export type EthContractType = {
  address: string,
  decimals: number,
  symbol: string,
  name: string,
  erc20?: boolean,
  erc721?: boolean
}

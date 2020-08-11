// @flow

export type EthContractType = {
  address: string,
  decimals: number,
  cryptoType: string,
  symbol: string,
  name: string,
  erc20?: boolean,
  erc721?: boolean
}

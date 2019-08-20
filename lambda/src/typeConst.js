// @flow

export type CryptoType = 'bitcoin' | 'ethereum' | 'dai'

export type WalletType = 'drive' | 'ledger' | 'metamask'

export type Utxos = Array<{
  value: number,
  script: string,
  outputIndex: number,
  txHash: string
}>

export type AddressBitcoin = {
  address: string,
  path: string,
  utxos: Utxos
}

export type HDWalletVariables = {
  xpub: string,
  xpriv: string,
  nextAddressIndex: number,
  nextChangeIndex: number,
  addresses: Array<AddressBitcoin>,
  lastBlockHeight: number,
  lastUpdate: number
}

export type AccountBitcoin = {
  balance: string,
  // address in hardware wallet is the next receiving address
  address: string,
  // not available for hardware wallet
  // nor metamask
  //
  // xPriv for hd wallet
  privateKey?: string,
  encryptedPrivateKey?: string,
  // optional hd wallet variables
  hdWalletVariables: HDWalletVariables
}

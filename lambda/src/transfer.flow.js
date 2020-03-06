// @flow
export type WalletLastUsedAddressType = {
  address: string,
  timestamp: string
}

export type WalletLastUsedAddressByWalletType = {
  // walletType -> cryptoType -> WalletLastUsedAddressType
  [key: string]: { [key: string]: WalletLastUsedAddressType }
}

export type WalletAddressDataType = {
  ...$Exact<WalletLastUsedAddressByWalletType>,
  googleId: string,
  lastUpdatedCryptoType: string,
  lastUpdatedWalletType: string
}

export type EmailAddressType = string

export type TransferDataClientType = {
  clientId: string
}

export type TransferDataIdType = {
  transferId: string,
  receivingId: string
}

export type TransferDataSenderType = {
  senderName: string,
  senderAvatar: string,
  sender: EmailAddressType,
  senderAccount: string
}

export type TransferDataReceiverType = {
  receiverName: string,
  destination: EmailAddressType,
  destinationAddress: string
}

export type TransferDataCryptoType = {
  cryptoType: string,
  cryptoSymbol: string,
  transferAmount: string,
  transferFiatAmountSpot: string,
  fiatType: string
}

export type TransferDataPrivateKeyType = {
  data: string
}

export type TxStateType = {
  txHash: string,
  txState: string,
  txTimestamp: string
}
export type TransferDataStateType = {
  transferStage: string,
  senderToChainsfer: TxStateType,
  chainsferToSender: TxStateType,
  chainsferToReceiver: TxStateType,
  reminder: {
    availableReminderToReceiver: number,
    expirationTime: number,
    reminderToReceiverCount: number,
    reminderToSenderCount: number
  }
}

export type TransferDataMessageType = {
  sendMessage?: string,
  receiveMessage?: string,
  cancelMessage?: string
}

export type TransferDataMetaType = {
  // auto generated data
  created: string,
  updated: string
}

export type MultiSigWalletType = {
  walletId: string,
  masterSig: EcdsaSigType
}

// complete transfer data db schema
export type TransferDataType = {
  ...$Exact<TransferDataClientType>,
  ...$Exact<TransferDataIdType>,
  ...$Exact<TransferDataSenderType>,
  ...$Exact<TransferDataReceiverType>,
  ...$Exact<TransferDataCryptoType>,
  ...$Exact<TransferDataPrivateKeyType>,
  ...$Exact<TransferDataMessageType>,
  ...$Exact<TransferDataStateType>,
  ...$Exact<TransferDataMetaType>,
  ...$Exact<MultiSigWalletType>,
  receiverAccount: string
}

export type SendTransferParamsType = {
  ...$Exact<TransferDataClientType>,
  ...$Exact<TransferDataSenderType>,
  ...$Exact<TransferDataReceiverType>,
  ...$Exact<TransferDataCryptoType>,
  ...$Exact<TransferDataPrivateKeyType>,
  ...$Exact<MultiSigWalletType>,
  sendMessage: ?string,
  sendTxHash: string | Array<string>,
  transferId: ?string
}

export type SendTransferReturnType = {
  transferId: string,
  sendTimestamp: string
}

export type ReceiveTransferParamsType = {
  receivingId: string,
  receiveMessage: ?string,
  receiverAccount: string,
  clientSig: EcdsaSigType
}

export type ReceiveTransferReturnType = {
  receiveTxHash: string,
  receiveTimestamp: string
}

export type CancelTransferParamsType = {
  transferId: string,
  cancelMessage: ?string,
  clientSig: EcdsaSigType
}

export type CancelTransferReturnType = {
  cancelTxHash: string,
  cancelTimestamp: string
}

export type GetMultiSigSigningDataParamsType = {
  transferId: string,
  receivingId: string,
  destinationAddress: string
}

export type GetMultiSigSigningDataReturnType = {
  data: string
}

export type DirectTransferParamsType = {
  senderAccount: string,
  destinationAccount: string,
  ...$Exact<TransferDataCryptoType>,
  sendTxHash: string
}

export type DirectTransferReturnType = {
  transferId: string,
  sendTimestamp: string
}


export type EcdsaSigType = string

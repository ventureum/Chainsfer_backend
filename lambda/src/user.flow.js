// @flow
export type RecipientType = {
  name: string,
  email: string,
  imageUrl: ?string, // recipient google avatar
  imageUrlUpdatedAt: ?number,
  addedAt: number, // timestamp
  updatedAt: number // timestamp
}

export type UserProfileType = {
  imageUrl: ?string,
  name: string,
  givenName: string,
  familyName: string
}

export type CloudWalletFolderMetaType = {
  fileId: string,
  lastModified: number // timestamp
}

export type UserTagType = {
  // login in a dapp with chainsfr login sdk
  dappUser: boolean,
  // register a dapp with chainsfr
  dappOwner: boolean,
  // users sending out invoices
  invoiceUser: boolean
}

export type UserType = {
  googleId: string,
  email: string,
  recipients: Array<RecipientType>,
  profile: UserProfileType,
  tags: UserTagType,
  cloudWalletFolderMeta: CloudWalletFolderMetaType,
  registerTime: number, // timestamp
  masterKey: ?string,
  cryptoAccounts: Array<CryptoAccountType>
}

export type RecipientListType = {
  googleId: string,
  recipients: Array<RecipientType>
}

export type CryptoAccountType = {
  id: string,

  cryptoType: string,
  walletType: string,
  platformType: string,
  address?: string,
  xpub?: string,
  name: string,
  verified: boolean,
  receivable: boolean,
  sendable: boolean,
  addedAt: number, // timestamp
  updatedAt: number // timestamp
}

export type CryptoAccounResponsetType = { cryptoAccounts: Array<CryptoAccountType> }

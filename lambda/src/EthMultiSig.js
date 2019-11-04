// @flow
import type { CryptoType, WalletType } from './typeConst'
import type {
  WalletLastUsedAddressType,
  WalletAddressDataType,
  TransferDataType,
  SendTransferParamsType,
  SendTransferReturnType,
  ReceiveTransferParamsType,
  ReceiveTransferReturnType,
  CancelTransferParamsType,
  CancelTransferReturnType,
  EcdsaSigType
} from './transfer.flow'

import { ethers } from 'ethers'

var Config = require('./config.js')

const SimpleMultiSigContractArtifacts = require('./contracts/SimpleMultiSig.json')
const ERC20Artifacts = require('./contracts/ERC20.json')

// constants
const TXTYPE_HASH = '0x3ee892349ae4bbe61dce18f95115b5dc02daf49204cc602458cd4c1f540d56d7'
const NAME_HASH = '0xb7a0bfa1b79f2443f4d73ebb9259cddbcd510b18be6fc4da7d1aa7b1786e73e6'
const VERSION_HASH = '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6'
const EIP712DOMAINTYPE_HASH = '0xd87cd6ef79d4e2b95e15ce8abf732db51ec771f1ca2edccf22a46c729ac56472'

if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()

// setup master account
if (!process.env.ETH_PRIVATE_KEY) throw new Error('ETH_PRIVATE_KEY missing')
const ethPrivateKey = process.env.ETH_PRIVATE_KEY

const CHAINID = Config.EthChainId[deploymentStage]

const provider = Config.EthTxAPIConfig[deploymentStage]
const wallet = new ethers.Wallet(ethPrivateKey, provider)
// log master address
console.info(`Master address: ${wallet.address}`)

const multiSigAddress = SimpleMultiSigContractArtifacts.networks[CHAINID].address
const masterAddress = wallet.address

// setup multisig contract instance
var multiSigInstance = new ethers.Contract(
  multiSigAddress,
  SimpleMultiSigContractArtifacts.abi,
  provider
)

// connect with a singer
multiSigInstance = multiSigInstance.connect(wallet)

async function getWalletData (
  walletId: string
): Promise<{
  nonce: number,
  owner: string,
  value: string,
  DOMAIN_SEPARATOR: string,
  erc20Addr: string
}> {
  const walletData = await multiSigInstance.getWallet(walletId)

  // return wallet value
  return {
    nonce: walletData[0].toNumber(),
    owner: walletData[1],
    value: walletData[2].toString(),
    DOMAIN_SEPARATOR: walletData[3],
    erc20Addr: walletData[4]
  }
}

async function executeMultiSig (
  transfer: TransferDataType,
  clientSig: EcdsaSigType,
  destinationAddress: string
): Promise<string> {
  // must check nonce first
  // escrow can only transfer out exactly once
  const walletData = await getWalletData(transfer.walletId)
  if (walletData.nonce !== 0) throw new Error(`Incorrect nonce ${walletData.nonce}`)

  const masterSig = transfer.masterSig

  const masterSigSplit = ethers.utils.splitSignature(masterSig)
  const clientSigSplit = ethers.utils.splitSignature(clientSig)

  const receiveTxHash = (await multiSigInstance.transfer(
    transfer.walletId,
    [masterSigSplit.v, clientSigSplit.v],
    [masterSigSplit.r, clientSigSplit.r],
    [masterSigSplit.s, clientSigSplit.s],
    destinationAddress
  )).hash

  return receiveTxHash
}

async function createSigningData (walletId: string, destinationAddress: string): Promise<string> {
  return multiSigInstance.getSig(walletId, destinationAddress)
}

async function getMasterSig (signingData: string): Promise<EcdsaSigType> {
  return ethers.utils.joinSignature(
    await wallet.signingKey.signDigest(ethers.utils.arrayify(signingData))
  )
}

async function getSenderAddress (transfer: TransferDataType): Promise<string> {
  const receipt = await provider.getTransactionReceipt(transfer.senderToChainsfer.txHash)
  return receipt.from
}

export default { executeMultiSig, createSigningData, getMasterSig, getSenderAddress }

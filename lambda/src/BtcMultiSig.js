// @flow
import * as bitcoin from 'bitcoinjs-lib'
import axios from 'axios'

if (!process.env.BTC_WIF) throw new Error('BTC_WIF missing')
const btcWif = process.env.BTC_WIF

if (!process.env.ENV_VALUE) throw new Error('ENV_VALUE missing')
const deploymentStage = process.env.ENV_VALUE.toLowerCase()

const network = deploymentStage === 'prod' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet

console.log('BtcMultiSigPublicKey: ', getBtcMultiSigPublicKey())

const LEDGER_API_URL =
  deploymentStage === 'prod'
    ? `https://api.ledgerwallet.com/blockchain/v2/btc`
    : `https://api.ledgerwallet.com/blockchain/v2/btc_testnet`

function getBtcMultiSigPublicKey (): { btcPublicKey: string } {
  const keyPair = bitcoin.ECPair.fromWIF(btcWif.charAt(0).toLowerCase() + btcWif.slice(1), network)
  return { btcPublicKey: keyPair.publicKey.toString('hex') }
}

async function sendBtcMultiSigTransaction (request: { psbt: string }): Promise<string> {
  const { psbt } = request
  let psbtFromFrontEnd = bitcoin.Psbt.fromBase64(psbt)

  const _psbt = bitcoin.Psbt.fromBase64(psbt)

  const keyPair = bitcoin.ECPair.fromWIF(btcWif.charAt(0).toLowerCase() + btcWif.slice(1), network)

  _psbt.signAllInputs(keyPair)

  _psbt.combine(psbtFromFrontEnd)

  _psbt.validateSignaturesOfAllInputs()
  _psbt.finalizeAllInputs()

  const rawTx = _psbt.extractTransaction().toHex()
  console.log('finalized Tx:', rawTx)
  const txHash = await broadcastBtcRawTx(rawTx)
  console.log('txHash', txHash)

  return txHash
}

async function broadcastBtcRawTx (txRaw: string): Promise<string> {
  const rv = await axios.post(`${LEDGER_API_URL}/transactions/send`, {
    tx: txRaw
  })
  return rv.data.result
}

export default { getBtcMultiSigPublicKey, sendBtcMultiSigTransaction }

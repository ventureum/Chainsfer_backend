// @flow
import moment from 'moment'
import { getUser, getUserRewards, updateUserRewards } from './userOps'
import { getTransferByReceivingId } from './dynamoDBTxOps'
import type { RewardDataType } from './reward.flow'
import type { RecipientType, CryptoAccountType } from './user.flow'
import type { SendTransferParamsType, ReceiveTransferParamsType } from './transfer.flow'
if (!process.env.USER_TABLE_NAME) throw new Error('USER_TABLE_NAME missing')
const userTableName = process.env.USER_TABLE_NAME

const MAX_ADD_RECIPIENT_REWARD_COUNT = 20

async function addRecipientReward (
  googleId: string,
  action: string,
  recipient: RecipientType
): Promise<RewardDataType | { error: string }> {
  const rewards = await getUserRewards(userTableName, googleId)
  // count the number of recipient rewards
  const numAddRecipientRewards = rewards.filter(
    (r: RewardDataType): boolean => r.rewardType === action
  ).length
  const reward = {
    rewardType: action,
    rewardValue: '50',
    timestamp: moment().unix(),
    meta: {
      name: recipient.name,
      email: recipient.email
    }
  }
  if (numAddRecipientRewards < MAX_ADD_RECIPIENT_REWARD_COUNT) {
    // cap not reached
    await updateUserRewards(userTableName, googleId, [...rewards, reward])
    return reward
  } else {
    return { error: 'Add recipient reward cap (20) reached' }
  }
}

async function addCryptoAccountsReward (
  googleId: string,
  action: string,
  payloadAccounts: Array<CryptoAccountType>
): Promise<RewardDataType | { error: string }> {
  const rewards = await getUserRewards(userTableName, googleId)
  // identify past rewards given to different walletType
  const walletTypeSet = rewards
    .filter((r: RewardDataType): boolean => r.rewardType === action)
    .reduce((walletTypeSet: Set<string>, r: RewardDataType): Set<string> => {
      walletTypeSet.add(r.meta.walletType)
      return walletTypeSet
    }, new Set())

  for (let account of payloadAccounts) {
    if (!walletTypeSet.has(account.walletType)) {
      // this walletType has not been added before
      // the reward is only given exactly once
      const reward = {
        rewardType: action,
        rewardValue: '80',
        timestamp: moment().unix(),
        meta: {
          cryptoType: account.cryptoType,
          walletType: account.walletType,
          platformType: account.platformType
        }
      }
      await updateUserRewards(userTableName, googleId, [...rewards, reward])
      return reward
    }
  }

  return { error: 'Add connection reward for this wallet type has already been given' }
}

async function sendReward (
  action: string,
  params: SendTransferParamsType
): Promise<RewardDataType | { error: string }> {
  const user = await getUser(userTableName, null, params.sender)
  const { googleId } = user
  const rewards = await getUserRewards(userTableName, googleId)
  if (params.transferId) {
    const reward = {
      rewardType: action,
      rewardValue: Math.floor(
        100 + Math.log(1.0 + parseFloat(params.transferFiatAmountSpot))
      ).toString(),
      timestamp: moment().unix(),
      meta: {
        transferId: params.transferId,
        senderName: params.senderName,
        sender: params.sender,
        receiverName: params.receiverName,
        destination: params.destination,
        cryptoType: params.cryptoType,
        cryptoSymbol: params.cryptoSymbol,
        transferAmount: params.transferAmount,
        transferFiatAmountSpot: params.transferFiatAmountSpot
      }
    }
    await updateUserRewards(userTableName, googleId, [...rewards, reward])
    return reward
  } else {
    return { error: 'No reward for dry run' }
  }
}

async function receiveReward (
  action: string,
  params: ReceiveTransferParamsType
): Promise<RewardDataType | { error: string }> {
  const transfer = await getTransferByReceivingId(params.receivingId)
  const user = await getUser(userTableName, null, transfer.destination)
  const { googleId } = user
  const rewards = await getUserRewards(userTableName, googleId)
    const reward = {
      rewardType: action,
      rewardValue: Math.floor(
        100 + Math.log(1.0 + parseFloat(transfer.transferFiatAmountSpot))
      ).toString(),
      timestamp: moment().unix(),
      meta: {
        receivingId: transfer.receivingId,
        senderName: transfer.senderName,
        sender: transfer.sender,
        receiverName: transfer.receiverName,
        destination: transfer.destination,
        cryptoType: transfer.cryptoType,
        cryptoSymbol: transfer.cryptoSymbol,
        transferAmount: transfer.transferAmount,
        transferFiatAmountSpot: transfer.transferFiatAmountSpot
      }
    }
    await updateUserRewards(userTableName, googleId, [...rewards, reward])
    return reward
}

export { addRecipientReward, addCryptoAccountsReward, sendReward, receiveReward }
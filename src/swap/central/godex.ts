import { floor, lt } from 'biggystring'
import {
  asArray,
  asEither,
  asMaybe,
  asNull,
  asObject,
  asOptional,
  asString
} from 'cleaners'
import {
  EdgeCorePluginOptions,
  EdgeMemo,
  EdgeSpendInfo,
  EdgeSwapInfo,
  EdgeSwapPlugin,
  EdgeSwapQuote,
  EdgeSwapRequest,
  JsonObject,
  SwapBelowLimitError,
  SwapCurrencyError
} from 'edge-core-js/types'

import {
  checkInvalidCodes,
  checkWhitelistedMainnetCodes,
  getCodesWithTranscription,
  getMaxSwappable,
  InvalidCurrencyCodes,
  makeSwapPluginQuote,
  SwapOrder
} from '../../util/swapHelpers'
import { convertRequest, getAddress, memoType } from '../../util/utils'
import { asNumberString, EdgeSwapRequestPlugin } from '../types'

const pluginId = 'godex'

const swapInfo: EdgeSwapInfo = {
  pluginId,
  isDex: false,
  displayName: 'Godex',
  supportEmail: 'support@godex.io'
}

const asInitOptions = asObject({
  apiKey: asOptional(asString)
})

const orderUri = 'https://godex.io/exchange/waiting/'
const uri = 'https://api.godex.io/api/v1/'

const expirationMs = 1000 * 60

const asApiInfo = asObject({
  min_amount: asNumberString,
  networks_from: asMaybe(
    asArray(
      asObject({
        network: asString
      })
    )
  ),
  networks_to: asMaybe(
    asArray(
      asObject({
        network: asString
      })
    )
  )
})

const asQuoteInfo = asObject({
  transaction_id: asString,
  deposit: asString,
  deposit_extra_id: asEither(asString, asNull),
  deposit_amount: asString,
  withdrawal: asString,
  withdrawal_extra_id: asEither(asString, asNull),
  withdrawal_amount: asString,
  return: asString,
  return_extra_id: asEither(asString, asNull)
})

const INVALID_CURRENCY_CODES: InvalidCurrencyCodes = {
  from: {
    digibyte: 'allCodes'
  },
  to: {
    zcash: ['ZEC'] // Godex doesn't support sending to unified addresses
  }
}

// Network names that don't match parent network currency code
// See https://godex.io/exchange-rate for list of supported currencies
const MAINNET_CODE_TRANSCRIPTION = {
  algorand: 'ALGO',
  arbitrum: 'ARBITRUM',
  avalanche: 'AVAXC',
  // axelar:
  // base:
  binance: 'BNB',
  binancesmartchain: 'BSC',
  bitcoin: 'BTC',
  bitcoincash: 'BCH',
  // bitcoingold:
  // bitcoinsv:
  cardano: 'ADA',
  celo: 'CELO',
  // coreum:
  cosmoshub: 'ATOM',
  dash: 'DASH',
  digibyte: 'DGB',
  dogecoin: 'DOGE',
  // eboost:
  eos: 'EOS',
  ethereumclassic: 'ETC',
  ethereum: 'ETH',
  fantom: 'FTM',
  // ethereumpow:
  filecoin: 'FIL',
  // feathercoin:
  // fio:
  // filecoinfevm:
  hedera: 'HBAR',
  // groestlcoin:
  litecoin: 'LTC',
  // liberland:
  optimism: 'OPTIMISM',
  monero: 'XMR',
  // piratechain:
  // osmosis:
  polygon: 'MATIC',
  polkadot: 'DOT',
  qtum: 'QTUM',
  // pulsechain:
  // ripple:
  ravencoin: 'RVN',
  // smartcash:
  rsk: 'RSK',
  stellar: 'XLM',
  solana: 'SOL',
  tezos: 'XTZ',
  // telos:
  tron: 'TRX',
  // thorchainrune:
  ton: 'TON',
  // vertcoin:
  // ufo:
  zcash: 'ZEC',
  // wax:
  // zksync:
  zcoin: 'FIRO'
}

export function makeGodexPlugin(opts: EdgeCorePluginOptions): EdgeSwapPlugin {
  const { io, log } = opts
  const { fetchCors = io.fetch } = io
  const initOptions = asInitOptions(opts.initOptions)

  async function call(
    url: string,
    request: EdgeSwapRequestPlugin,
    data: { params: JsonObject }
  ): Promise<JsonObject> {
    const body = JSON.stringify(data.params)

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
    const response = await fetchCors(url, { method: 'POST', body, headers })
    if (!response.ok) {
      if (response.status === 422) {
        throw new SwapCurrencyError(swapInfo, request)
      }
      throw new Error(`godex returned error code ${response.status}`)
    }
    return await response.json()
  }

  const fetchSwapQuoteInner = async (
    request: EdgeSwapRequestPlugin,
    opts: { promoCode?: string }
  ): Promise<SwapOrder> => {
    const reverseQuote = request.quoteFor === 'to'

    // Grab addresses:
    const [fromAddress, toAddress] = await Promise.all([
      getAddress(request.fromWallet),
      getAddress(request.toWallet)
    ])

    const { fromMainnetCode, toMainnetCode } = getCodesWithTranscription(
      request,
      MAINNET_CODE_TRANSCRIPTION
    )

    // Convert the native amount to a denomination:
    const quoteAmount =
      request.quoteFor === 'from'
        ? await request.fromWallet.nativeToDenomination(
            request.nativeAmount,
            request.fromCurrencyCode
          )
        : await request.toWallet.nativeToDenomination(
            request.nativeAmount,
            request.toCurrencyCode
          )

    // Swap the currencies if we need a reverse quote:
    const quoteParams = {
      from: request.fromCurrencyCode,
      to: request.toCurrencyCode,
      amount: quoteAmount
    }
    log('quoteParams:', quoteParams)

    // Check if we are below the minimum limit:
    let fromAmount, toAmount, endpoint
    if (request.quoteFor === 'from') {
      fromAmount = quoteAmount
      endpoint = 'info'
    } else {
      toAmount = quoteAmount
      endpoint = 'info-revert'
    }
    const response = await call(uri + endpoint, request, {
      params: quoteParams
    })
    const reply = asApiInfo(response)

    // The info/info-revert endpoints don't accept the coin_from/coin_to params so the
    // min_amount returned could be for a different network than the user is requesting.
    // Check the minimum:
    const nativeMin = reverseQuote
      ? await request.toWallet.denominationToNative(
          reply.min_amount,
          request.toCurrencyCode
        )
      : await request.fromWallet.denominationToNative(
          reply.min_amount,
          request.fromCurrencyCode
        )

    if (lt(request.nativeAmount, nativeMin)) {
      throw new SwapBelowLimitError(
        swapInfo,
        nativeMin,
        reverseQuote ? 'to' : 'from'
      )
    }

    // Check the networks. Networks aren't present for disabled assets.
    if (
      reply.networks_from?.find(
        network => network.network === fromMainnetCode
      ) == null ||
      reply.networks_to?.find(network => network.network === toMainnetCode) ==
        null
    ) {
      throw new SwapCurrencyError(swapInfo, request)
    }

    const { promoCode } = opts

    endpoint = reverseQuote ? 'transaction-revert' : 'transaction'
    const sendReply = await call(
      uri + endpoint + (promoCode != null ? `?promo=${promoCode}` : ''),
      request,
      {
        params: {
          deposit_amount: reverseQuote ? undefined : fromAmount,
          withdrawal_amount: reverseQuote ? toAmount : undefined,
          coin_from: request.fromCurrencyCode,
          coin_to: request.toCurrencyCode,
          withdrawal: toAddress,
          return: fromAddress,
          return_extra_id: null,
          withdrawal_extra_id: null,
          affiliate_id: initOptions.apiKey,
          type: 'edge',
          isEstimate: false,
          coin_from_network: fromMainnetCode,
          coin_to_network: toMainnetCode
        }
      }
    )
    log('sendReply' + JSON.stringify(sendReply, null, 2))
    const quoteInfo = asQuoteInfo(sendReply)
    const fromNativeAmount = floor(
      await request.fromWallet.denominationToNative(
        quoteInfo.deposit_amount,
        request.fromCurrencyCode
      ),
      0
    )
    const toNativeAmount = floor(
      await request.toWallet.denominationToNative(
        quoteInfo.withdrawal_amount,
        request.toCurrencyCode
      ),
      0
    )

    log('fromNativeAmount: ' + fromNativeAmount)
    log('toNativeAmount: ' + toNativeAmount)

    const memos: EdgeMemo[] =
      quoteInfo.deposit_extra_id == null
        ? []
        : [
            {
              type: memoType(request.fromWallet.currencyInfo.pluginId),
              value: quoteInfo.deposit_extra_id
            }
          ]

    // Make the transaction:
    const spendInfo: EdgeSpendInfo = {
      tokenId: request.fromTokenId,
      spendTargets: [
        {
          nativeAmount: fromNativeAmount,
          publicAddress: quoteInfo.deposit
        }
      ],
      memos,
      networkFeeOption:
        request.fromCurrencyCode.toUpperCase() === 'BTC' ? 'high' : 'standard',
      assetAction: {
        assetActionType: 'swap'
      },
      savedAction: {
        actionType: 'swap',
        swapInfo,
        orderId: quoteInfo.transaction_id,
        orderUri: orderUri + quoteInfo.transaction_id,
        isEstimate: false,
        toAsset: {
          pluginId: request.toWallet.currencyInfo.pluginId,
          tokenId: request.toTokenId,
          nativeAmount: toNativeAmount
        },
        fromAsset: {
          pluginId: request.fromWallet.currencyInfo.pluginId,
          tokenId: request.fromTokenId,
          nativeAmount: fromNativeAmount
        },
        payoutAddress: toAddress,
        payoutWalletId: request.toWallet.id,
        refundAddress: fromAddress
      }
    }
    log('spendInfo', spendInfo)

    return {
      request,
      spendInfo,
      swapInfo,
      fromNativeAmount,
      expirationDate: new Date(Date.now() + expirationMs)
    }
  }

  const out: EdgeSwapPlugin = {
    swapInfo,

    async fetchSwapQuote(
      req: EdgeSwapRequest,
      userSettings: Object | undefined,
      opts: { promoCode?: string }
    ): Promise<EdgeSwapQuote> {
      const request = convertRequest(req)
      checkInvalidCodes(INVALID_CURRENCY_CODES, request, swapInfo)
      checkWhitelistedMainnetCodes(
        MAINNET_CODE_TRANSCRIPTION,
        request,
        swapInfo
      )

      const newRequest = await getMaxSwappable(
        fetchSwapQuoteInner,
        request,
        opts
      )
      const swapOrder = await fetchSwapQuoteInner(newRequest, opts)
      return await makeSwapPluginQuote(swapOrder)
    }
  }

  return out
}

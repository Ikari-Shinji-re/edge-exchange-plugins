import { asEither, asNumber, asString } from 'cleaners'
import { EdgeCurrencyWallet, EdgeMetadata, EdgeTxSwap } from 'edge-core-js'

export interface EdgeSwapRequestPlugin {
  fromWallet: EdgeCurrencyWallet
  toWallet: EdgeCurrencyWallet
  fromTokenId?: string
  toTokenId?: string
  nativeAmount: string
  quoteFor: 'from' | 'max' | 'to'
  fromCurrencyCode: string
  toCurrencyCode: string
}

export const asNumberString = (raw: any): string => {
  const n = asEither(asString, asNumber)(raw)
  return n.toString()
}

export interface StringMap {
  [key: string]: string
}

/**
 * Duplicated from edge-currency-accountbased until this
 * is elevatd to a type in edge-core-js
 */
export type MakeTxParams =
  | {
      type: 'MakeTxDexSwap'
      metadata?: EdgeMetadata
      swapData?: EdgeTxSwap
      fromTokenId?: string
      fromNativeAmount: string
      toTokenId?: string
      toNativeAmount: string

      /**
       * UNIX time (seconds) to expire the DEX swap if it hasn't executed
       */
      expiration?: number
    }
import 'regenerator-runtime/runtime'

import type { EdgeCorePlugins } from 'edge-core-js/types'

import { makeChangeHeroPlugin } from './swap/central/changehero'
import { makeChangeNowPlugin } from './swap/central/changenow'
import { makeExolixPlugin } from './swap/central/exolix'
import { makeGodexPlugin } from './swap/central/godex'
import { makeLetsExchangePlugin } from './swap/central/letsexchange'
import { makeSideshiftPlugin } from './swap/central/sideshift'
import { makeSwapuzPlugin } from './swap/central/swapuz'
import { makeCosmosIbcPlugin } from './swap/defi/cosmosIbc'
import { makeLifiPlugin } from './swap/defi/lifi'
import { makeRangoPlugin } from './swap/defi/rango'
import { makeThorchainPlugin } from './swap/defi/thorchain'
import { makeThorchainDaPlugin } from './swap/defi/thorchainDa'
import { makeSpookySwapPlugin } from './swap/defi/uni-v2-based/plugins/spookySwap'
import { makeTombSwapPlugin } from './swap/defi/uni-v2-based/plugins/tombSwap'
import { makeVelodromePlugin } from './swap/defi/uni-v2-based/plugins/velodrome'
import { makeTransferPlugin } from './swap/transfer'
import { xrpdex } from './swap/xrpDexInfo'

const plugins = {
  // Swap plugins:
  changehero: makeChangeHeroPlugin,
  changenow: makeChangeNowPlugin,
  cosmosibc: makeCosmosIbcPlugin,
  exolix: makeExolixPlugin,
  godex: makeGodexPlugin,
  letsexchange: makeLetsExchangePlugin,
  lifi: makeLifiPlugin,
  sideshift: makeSideshiftPlugin,
  spookySwap: makeSpookySwapPlugin,
  swapuz: makeSwapuzPlugin,
  thorchain: makeThorchainPlugin,
  thorchainda: makeThorchainDaPlugin,
  tombSwap: makeTombSwapPlugin,
  transfer: makeTransferPlugin,
  velodrome: makeVelodromePlugin,
  xrpdex,
  rango: makeRangoPlugin
}

declare global {
  interface Window {
    addEdgeCorePlugins?: (plugins: EdgeCorePlugins) => void
  }
}

if (
  typeof window !== 'undefined' &&
  typeof window.addEdgeCorePlugins === 'function'
) {
  window.addEdgeCorePlugins(plugins)
}

export default plugins

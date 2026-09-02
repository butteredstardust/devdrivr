import { handleRpc } from './rpc'
import { analyze } from './css.api'

const api = { analyze }

export type CssWorker = typeof api
handleRpc(api)

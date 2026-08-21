import { handleRpc } from './rpc'
import { transformBase64 } from './base64.api'

const api = { transformBase64 }

export type Base64Worker = typeof api
handleRpc(api)

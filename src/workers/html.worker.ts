import { handleRpc } from './rpc'
import { validateHtml } from './html.api'

const api = { validateHtml }

export type HtmlWorker = typeof api
handleRpc(api)

import { handleRpc } from './rpc'
import { validate, format, minify, toJson, stats, inspect, tree, queryXPath } from './xml.api'

const api = {
  validate,
  format,
  minify,
  toJson,
  stats,
  inspect,
  tree,
  queryXPath,
}

export type XmlWorker = typeof api

handleRpc(api)

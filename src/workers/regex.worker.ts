import { handleRpc } from './rpc'
import { evaluateRegex } from './regex.api'
import type { RegexEvaluation, RegexEvaluationInput } from './regex.api'

const api = {
  evaluate(input: RegexEvaluationInput): RegexEvaluation {
    return evaluateRegex(input)
  },
}

export type RegexWorker = typeof api

handleRpc(api)

import { readFileSync } from 'node:fs'

const logPath = process.argv[2]

if (!logPath) {
  console.error('Usage: node .github/scripts/waive-bun-audit.mjs <audit-log>')
  process.exit(1)
}

const log = readFileSync(logPath, 'utf8')

const allowedAdvisories = [
  {
    id: 'GHSA-w7jw-789q-3m8p',
    packageName: 'shell-quote',
    requiredEvidence: ['workspace:expo-app', 'react-native'],
    reason:
      'Known critical advisory in the Expo/React Native workspace, unrelated to apps/cockpit changes.',
  },
]

const advisoryIds = [...new Set(log.match(/GHSA-[a-z0-9-]+/gi) ?? [])]

if (advisoryIds.length === 0) {
  console.error('bun audit failed, but no advisory ID was found in the audit output.')
  process.exit(1)
}

const unwaived = advisoryIds.filter(
  (id) => !allowedAdvisories.some((allowed) => allowed.id.toLowerCase() === id.toLowerCase())
)

if (unwaived.length > 0) {
  console.error(`bun audit found unwaived advisories: ${unwaived.join(', ')}`)
  process.exit(1)
}

for (const allowed of allowedAdvisories) {
  if (!advisoryIds.some((id) => id.toLowerCase() === allowed.id.toLowerCase())) continue

  const missingEvidence = [allowed.packageName, ...allowed.requiredEvidence].filter(
    (evidence) => !log.includes(evidence)
  )

  if (missingEvidence.length > 0) {
    console.error(
      `Waiver ${allowed.id} did not match expected audit evidence: ${missingEvidence.join(', ')}`
    )
    process.exit(1)
  }

  console.warn(`Waived ${allowed.id} (${allowed.packageName}): ${allowed.reason}`)
}

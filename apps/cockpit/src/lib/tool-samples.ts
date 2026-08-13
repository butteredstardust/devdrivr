/**
 * Small, realistic sample inputs for the "Load sample" empty-state affordance.
 * Keyed by tool id (see `src/app/tool-registry.ts`). Samples are intentionally
 * short (a dozen lines or fewer) and contain no real credentials or personal
 * data — the JWT sample is an obviously fake, unsigned-looking token.
 */

export const TOOL_SAMPLES: Partial<Record<string, string>> = {
  'json-tools': `{
  "id": "ord_8f2a1c",
  "customer": "Ada Lovelace",
  "items": [
    { "sku": "book-001", "qty": 2, "price": 12.5 },
    { "sku": "pen-014", "qty": 5, "price": 1.2 }
  ],
  "shipped": false,
  "total": 31.0
}`,

  'xml-tools': `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <book id="bk101">
    <author>Ada Lovelace</author>
    <title>Notes on the Analytical Engine</title>
    <price>12.50</price>
  </book>
  <book id="bk102">
    <author>Grace Hopper</author>
    <title>Compiler Basics</title>
    <price>9.99</price>
  </book>
</catalog>`,

  'yaml-tools': `service: cockpit
version: 0.1.58
env: development
features:
  - json-tools
  - yaml-tools
  - diff-viewer
limits:
  maxUploadMb: 25
  timeoutSec: 30`,

  'jwt-decoder':
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vLXVzZXIiLCJuYW1lIjoiQWRhIEV4YW1wbGUiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTk5OTk5OTk5OX0.fakesignature_not_a_real_signature',
}

/** Diff Viewer needs a left/right pair rather than a single input string. */
export const DIFF_VIEWER_SAMPLE = {
  left: `function greet(name) {
  console.log("Hello " + name);
}

greet("world");`,
  right: `function greet(name, punctuation = "!") {
  console.log(\`Hello \${name}\${punctuation}\`);
}

greet("world");`,
}

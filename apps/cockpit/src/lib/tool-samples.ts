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

  // Deliberately imperfect: an uppercase tag, an unquoted attribute, a missing
  // alt, a duplicated id, an unlabelled input and a typeless button, so the
  // problems panel has something to demonstrate.
  'html-validator': `<!DOCTYPE html>
<html>
  <head>
    <title>Sample</title>
  </head>
  <body>
    <DIV class=card>
      <img src="logo.png">
      <h3>Sales</h3>
      <p id="total">1 &lt; 2</p>
      <p id="total">Duplicated id</p>
      <input type="text" name="query">
      <button>Go</button>
    </DIV>
  </body>
</html>`,

  // Deliberately imperfect: a misspelled property, a value that does not match
  // its grammar, a duplicated declaration, an ID selector, a deep selector and
  // a unit on zero, so the problems panel has something to demonstrate.
  'css-validator': `#page .sidebar .panel .title {
  colr: #333333;
  padding: 0px 1rem;
  margin: 3;
  display: flex;
  display: block;
}

.empty {}
`,

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

  'csv-tools': `id,name,role,signups,active,joined
1,Ada Lovelace,engineer,42,true,2024-01-15
2,Grace Hopper,architect,17,true,2024-02-03
3,Alan Turing,researcher,,false,2024-02-19
4,Katherine Johnson,analyst,8,true,2024-03-07`,

  // Genuinely signed with the HS256 secret `devdrivr-demo-secret`, so pasting that into the
  // decoder's secret field demonstrates verification. The signature used to be the literal string
  // `fakesignature_not_a_real_signature`, which was harmless while the tool only decoded — now that
  // it verifies, the built-in sample would have announced "Signature invalid" and looked broken.
  'jwt-decoder':
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vLXVzZXIiLCJuYW1lIjoiQWRhIEV4YW1wbGUiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTk5OTk5OTk5OX0.QN2XAKs0z0ZCi7e8xNwnR2pfHYRKLcfKO-hYDP1OOA0',
}

/**
 * TypeScript Playground's starting document, also offered as "Load example"
 * once the editor is empty. Deliberately exercises interfaces, generics via
 * `Array.map` and a DOM global so a broken standard library shows up at once.
 */
export const TS_PLAYGROUND_SAMPLE = `interface User {
  id: number
  name: string
  email: string
}

function greet(user: User): string {
  return \`Hello, \${user.name}!\`
}

const users: User[] = [{ id: 1, name: 'Alice', email: 'alice@example.com' }]

const greeting = users.map(greet)
console.log(greeting)
`

/**
 * Refactoring Toolkit's "Load example". Deliberately contains something for
 * every category: `var` and a `function` expression to modernise, a loose `==`
 * to tighten, and a `console.log` for the destructive cleanup transforms.
 */
export const REFACTORING_SAMPLE = `var API = require('./api')

var fetchUser = function (id) {
  return API.get('/users/' + id).then(function (res) {
    if (res.status == 200) {
      console.log('loaded', res.data)
      return res.data
    }
    return null
  })
}

module.exports = { fetchUser: fetchUser }
`

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

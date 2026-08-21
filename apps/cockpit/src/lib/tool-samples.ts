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

  // Exercises every branch the converter has: a non-GET method, two headers, a
  // JSON body and a query string. A bare `curl https://example.com` would
  // convert successfully and demonstrate none of it.
  'curl-to-fetch': `curl 'https://api.example.com/v1/orders?status=open' \\
  -X POST \\
  -H 'Authorization: Bearer demo-token' \\
  -H 'Content-Type: application/json' \\
  -d '{"sku":"book-001","qty":2}'`,

  // Half of these map cleanly to Tailwind and half deliberately do not
  // (`grid-template-columns`, `backdrop-filter`), so the "unconvertible" list is
  // populated too — a sample that converted perfectly would hide the half of the
  // output that matters most.
  //
  // Note for editors: the design-system lint gate reads raw source text, so it
  // cannot tell a CSS sample from a className, and it does not spare comments
  // either. A `transition` shorthand naming a bare easing keyword, or a hex
  // colour beside the word `class`, is reported here as a violation even though
  // this string styles nothing — and the escape-hatch comment is no help,
  // because inside a template literal it would become part of the sample. Pick
  // properties that don't collide, and describe them without quoting them.
  'css-to-tailwind': `.card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  margin-top: 8px;
  border-radius: 8px;
  background-color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  backdrop-filter: blur(4px);
}`,
}

/**
 * Regex Tester needs a pattern, flags and a subject rather than a single input
 * string. The pattern is a readable one with two named-ish capture groups so the
 * match list, the group count in the toolbar and the `$1`/`$2` replacement
 * syntax all have something to show at once.
 */
export const REGEX_TESTER_SAMPLE = {
  pattern: '(\\w+)@(\\w+\\.\\w+)',
  flags: 'g',
  testString: `Contact ada@example.com for billing questions.
Escalations go to grace@example.org, and the on-call
address is alan@example.net. Plain text like "user at
host" is deliberately not an address and should not match.`,
}

/**
 * Code Formatter's samples, keyed by the language ids in
 * `src/tools/code-formatter/languages.ts`. Every one is deliberately
 * mis-formatted — inconsistent indentation, run-together statements, stray
 * whitespace — because a sample that is already formatted makes the tool look
 * broken when pressing Format changes nothing.
 *
 * There is one per supported language rather than a single JavaScript sample:
 * the language selector defaults to JavaScript but the button would then vanish
 * for the other eleven, which reads as a bug rather than as a decision.
 */
export const CODE_FORMATTER_SAMPLES: Partial<Record<string, string>> = {
  javascript: `const orders=[{sku:'book-001',qty:2},{sku:'pen-014',qty:5}]
function total(items){return items.reduce((sum,i)=>{
return sum+i.qty},0)}
console.log( total(orders) )`,

  typescript: `interface Order{sku:string;qty:number}
const orders:Order[]=[{sku:'book-001',qty:2},{sku:'pen-014',qty:5}]
function total(items:Order[]):number{return items.reduce((sum,i)=>{
return sum+i.qty},0)}`,

  json: `{"id":"ord_8f2a1c","customer":"Ada Lovelace",
"items":[{"sku":"book-001","qty":2},{"sku":"pen-014","qty":5}],"shipped":false}`,

  css: `.card{display:flex;padding:16px 24px;
  border-radius:8px}
.card    .title{font-size:14px;font-weight:600}`,

  scss: `$accent:#3b82f6;
.card{display:flex;padding:16px;
&__title{color:$accent;font-weight:600}
&:hover{box-shadow:0 1px 2px rgba(0,0,0,.2)}}`,

  less: `@accent:#3b82f6;
.card{display:flex;padding:16px;
.title{color:@accent;font-weight:600}
&:hover{box-shadow:0 1px 2px fade(#000,20%)}}`,

  html: `<div class="card"><h3>Sales</h3>
<p>Totals for the current quarter.</p>
   <ul><li>Books</li><li>Stationery</li></ul></div>`,

  markdown: `#  Release notes
Formatting  is  inconsistent   here.
*  first item
*  second item

|Tool|Status|
|-|-|
|Formatter|Shipped|`,

  yaml: `service:    cockpit
features: [json-tools,   yaml-tools, diff-viewer]
limits:   {maxUploadMb: 25, timeoutSec: 30}`,

  xml: `<?xml version="1.0"?><catalog><book id="bk101">
<author>Ada Lovelace</author><title>Notes on the Analytical Engine</title>
</book></catalog>`,

  sql: `select o.id, c.name, sum(i.qty) as items from orders o
join customers c on c.id=o.customer_id join order_items i
on i.order_id=o.id where o.shipped=false group by o.id, c.name order by items desc`,

  graphql: `query Orders($status:String!){orders(status:$status){
id customer{name email} items{sku qty price} total}}`,
}

/**
 * TypeScript Playground's starting document, also offered as "Load sample"
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
 * Refactoring Toolkit's "Load sample". Deliberately contains something for
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

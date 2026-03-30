# JavaScript Snippets Collection

Copy the JSON array below and paste into the Snippets Manager import (F10).

```json
[
  {
    "title": "Deep Clone Object",
    "content": "const deepClone = (obj) => JSON.parse(JSON.stringify(obj));",
    "language": "javascript",
    "tags": ["utility", "object"]
  },
  {
    "title": "Debounce Function",
    "content": "const debounce = (fn, delay) => {\n  let timeoutId;\n  return (...args) => {\n    clearTimeout(timeoutId);\n    timeoutId = setTimeout(() => fn(...args), delay);\n  };\n};",
    "language": "javascript",
    "tags": ["utility", "performance"]
  },
  {
    "title": "Throttle Function",
    "content": "const throttle = (fn, limit) => {\n  let inThrottle;\n  return (...args) => {\n    if (!inThrottle) {\n      fn(...args);\n      inThrottle = true;\n      setTimeout(() => (inThrottle = false), limit);\n    }\n  };\n};",
    "language": "javascript",
    "tags": ["utility", "performance"]
  },
  {
    "title": "Sleep / Delay",
    "content": "const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));",
    "language": "javascript",
    "tags": ["async", "utility"]
  },
  {
    "title": "Generate UUID",
    "content": "const generateUUID = () =>\n  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {\n    const r = (Math.random() * 16) | 0;\n    const v = c === 'x' ? r : (r & 0x3) | 0x8;\n    return v.toString(16);\n  });",
    "language": "javascript",
    "tags": ["utility", "id"]
  },
  {
    "title": "Flatten Array",
    "content": "const flatten = (arr) => arr.reduce((acc, val) => acc.concat(val), []);\nconst flattenDeep = (arr) => arr.flat(Infinity);",
    "language": "javascript",
    "tags": ["array", "utility"]
  },
  {
    "title": "Unique Array",
    "content": "const unique = (arr) => [...new Set(arr)];\nconst uniqueBy = (arr, key) => arr.filter((item, i) => arr.findIndex((t) => t[key] === item[key]) === i);",
    "language": "javascript",
    "tags": ["array", "utility"]
  },
  {
    "title": "Group Array by Key",
    "content": "const groupBy = (arr, key) =>\n  arr.reduce((acc, item) => {\n    const group = item[key];\n    acc[group] = acc[group] || [];\n    acc[group].push(item);\n    return acc;\n  }, {});",
    "language": "javascript",
    "tags": ["array", "utility"]
  },
  {
    "title": "Pick Object Keys",
    "content": "const pick = (obj, keys) =>\n  keys.reduce((acc, key) => {\n    if (key in obj) acc[key] = obj[key];\n    return acc;\n  }, {});",
    "language": "javascript",
    "tags": ["object", "utility"]
  },
  {
    "title": "Omit Object Keys",
    "content": "const omit = (obj, keys) =>\n  Object.fromEntries(Object.entries(obj).filter(([key]) => !keys.includes(key)));",
    "language": "javascript",
    "tags": ["object", "utility"]
  },
  {
    "title": "Is Empty Check",
    "content": "const isEmpty = (val) => {\n  if (val == null) return true;\n  if (typeof val === 'string') return val.trim().length === 0;\n  if (Array.isArray(val)) return val.length === 0;\n  if (typeof val === 'object') return Object.keys(val).length === 0;\n  return false;\n};",
    "language": "javascript",
    "tags": ["utility", "validation"]
  },
  {
    "title": "Format Currency",
    "content": "const formatCurrency = (amount, currency = 'USD', locale = 'en-US') =>\n  new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);",
    "language": "javascript",
    "tags": ["formatting", "i18n"]
  },
  {
    "title": "Format Number",
    "content": "const formatNumber = (num, locale = 'en-US') => new Intl.NumberFormat(locale).format(num);",
    "language": "javascript",
    "tags": ["formatting"]
  },
  {
    "title": "Parse Query String",
    "content": "const parseQuery = (queryString) =>\n  Object.fromEntries(new URLSearchParams(queryString).entries());",
    "language": "javascript",
    "tags": ["url", "utility"]
  },
  {
    "title": "Build Query String",
    "content": "const buildQuery = (params) =>\n  Object.entries(params)\n    .filter(([, v]) => v != null)\n    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)\n    .join('&');",
    "language": "javascript",
    "tags": ["url", "utility"]
  },
  {
    "title": "Random Number Range",
    "content": "const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;\nconst randomFloat = (min, max) => Math.random() * (max - min) + min;",
    "language": "javascript",
    "tags": ["math", "utility"]
  },
  {
    "title": "Shuffle Array",
    "content": "const shuffle = (arr) => {\n  const result = [...arr];\n  for (let i = result.length - 1; i > 0; i--) {\n    const j = Math.floor(Math.random() * (i + 1));\n    [result[i], result[j]] = [result[j], result[i]];\n  }\n  return result;\n};",
    "language": "javascript",
    "tags": ["array", "random"]
  },
  {
    "title": "Chunk Array",
    "content": "const chunk = (arr, size) =>\n  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>\n    arr.slice(i * size, i * size + size)\n  );",
    "language": "javascript",
    "tags": ["array", "utility"]
  },
  {
    "title": "Retry Async Function",
    "content": "const retry = async (fn, attempts = 3, delay = 1000) => {\n  for (let i = 0; i < attempts; i++) {\n    try {\n      return await fn();\n    } catch (err) {\n      if (i === attempts - 1) throw err;\n      await new Promise((r) => setTimeout(r, delay));\n    }\n  }\n};",
    "language": "javascript",
    "tags": ["async", "error-handling"]
  },
  {
    "title": "Memoize Function",
    "content": "const memoize = (fn) => {\n  const cache = new Map();\n  return (...args) => {\n    const key = JSON.stringify(args);\n    if (cache.has(key)) return cache.get(key);\n    const result = fn(...args);\n    cache.set(key, result);\n    return result;\n  };\n};",
    "language": "javascript",
    "tags": ["performance", "caching"]
  },
  {
    "title": "TryParse JSON Safe",
    "content": "const tryParseJSON = (str, fallback = null) => {\n  try {\n    return JSON.parse(str);\n  } catch {\n    return fallback;\n  }\n};",
    "language": "javascript",
    "tags": ["json", "error-handling"]
  },
  {
    "title": "Capitalize String",
    "content": "const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);\nconst titleCase = (str) => str.replace(/\\w\\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());",
    "language": "javascript",
    "tags": ["string", "formatting"]
  },
  {
    "title": "Truncate String",
    "content": "const truncate = (str, length, suffix = '...') =>\n  str.length > length ? str.slice(0, length - suffix.length) + suffix : str;",
    "language": "javascript",
    "tags": ["string", "formatting"]
  },
  {
    "title": "Get Nested Object Value",
    "content": "const get = (obj, path, defaultValue = undefined) => {\n  const keys = path.split('.');\n  let result = obj;\n  for (const key of keys) {\n    if (result == null) return defaultValue;\n    result = result[key];\n  }\n  return result ?? defaultValue;\n};",
    "language": "javascript",
    "tags": ["object", "utility"]
  },
  {
    "title": "Copy to Clipboard",
    "content": "const copyToClipboard = async (text) => {\n  try {\n    await navigator.clipboard.writeText(text);\n    return true;\n  } catch {\n    const ta = document.createElement('textarea');\n    ta.value = text;\n    ta.style.position = 'fixed';\n    ta.style.opacity = '0';\n    document.body.appendChild(ta);\n    ta.select();\n    document.execCommand('copy');\n    document.body.removeChild(ta);\n    return true;\n  }\n};",
    "language": "javascript",
    "tags": ["browser", "clipboard"]
  }
]
```

## Usage

1. Copy the JSON array above (just the array, not the markdown code fences)
2. Open Snippets Manager in devdrivr cockpit
3. Press **F10** or click **[F10: IMP]**
4. The snippets will be imported

## Snippet List

| # | Title | Tags |
|---|-------|------|
| 1 | Deep Clone Object | utility, object |
| 2 | Debounce Function | utility, performance |
| 3 | Throttle Function | utility, performance |
| 4 | Sleep / Delay | async, utility |
| 5 | Generate UUID | utility, id |
| 6 | Flatten Array | array, utility |
| 7 | Unique Array | array, utility |
| 8 | Group Array by Key | array, utility |
| 9 | Pick Object Keys | object, utility |
| 10 | Omit Object Keys | object, utility |
| 11 | Is Empty Check | utility, validation |
| 12 | Format Currency | formatting, i18n |
| 13 | Format Number | formatting |
| 14 | Parse Query String | url, utility |
| 15 | Build Query String | url, utility |
| 16 | Random Number Range | math, utility |
| 17 | Shuffle Array | array, random |
| 18 | Chunk Array | array, utility |
| 19 | Retry Async Function | async, error-handling |
| 20 | Memoize Function | performance, caching |
| 21 | TryParse JSON Safe | json, error-handling |
| 22 | Capitalize String | string, formatting |
| 23 | Truncate String | string, formatting |
| 24 | Get Nested Object Value | object, utility |
| 25 | Copy to Clipboard | browser, clipboard |

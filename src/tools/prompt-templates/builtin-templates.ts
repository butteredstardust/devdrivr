import { estimateTokens, variableLabel } from './template-utils'
import type { PromptTemplate } from './types'

const SOURCE_URL = 'https://github.com/WebitroHQ/promtexpress-oss'

function buildTemplate(template: Omit<PromptTemplate, 'estimatedTokens'>): PromptTemplate {
  return { ...template, estimatedTokens: estimateTokens(template.prompt) }
}

export const BUILTIN_PROMPT_TEMPLATES: PromptTemplate[] = [
  buildTemplate({
    id: 'audio/podcast-intro-voiceover',
    name: 'Podcast intro voice-over',
    description:
      'Writes a 15-20 second podcast intro script with performance directions for a text-to-speech voice or a human narrator.',
    category: 'content-creation',
    tags: ['podcast', 'voice-over', 'text-to-speech'],
    prompt:
      "Write and direct a podcast intro voice-over.\n\nShow: {{show_name}}\nPromise to the listener: {{show_promise}}\nHosts: {{host}}\nVoice: {{voice_style}}\n\nRequirements:\n- 40 to 55 spoken words, which reads in 15-20 seconds at a natural pace.\n- Open with a one-line hook that speaks to the listener's problem, not the show's name.\n- Say the show name once, in the second half.\n- Close with a handoff line that leads into the hosts, naming them.\n- Write for the ear: short sentences, no parentheses, no abbreviations or symbols that a voice would read awkwardly; spell out numbers the way they should be spoken.\n\nOutput two versions, each formatted as:\nSCRIPT: the exact words to be spoken\nDIRECTION: pacing, where to pause (mark pauses as [pause] in the script), which word to stress, and energy from start to finish\nMUSIC CUE: when the intro music should duck under the voice and when it should swell back",
    variables: [
      {
        name: 'show_name',
        label: variableLabel('show_name'),
        type: 'text',
        placeholder: 'Ship It Weekly',
        description: 'Name of the podcast',
        example: 'Ship It Weekly',
        required: true,
      },
      {
        name: 'show_promise',
        label: variableLabel('show_promise'),
        type: 'text',
        placeholder: 'honest stories from indie founders about what actually made their first $10k',
        description: 'What listeners get from every episode',
        example: 'honest stories from indie founders about what actually made their first $10k',
        required: true,
      },
      {
        name: 'host',
        label: variableLabel('host'),
        type: 'text',
        placeholder: 'Deniz and Mark',
        description: 'Host name or names',
        example: 'Deniz and Mark',
        required: true,
      },
      {
        name: 'voice_style',
        label: variableLabel('voice_style'),
        type: 'text',
        placeholder: 'warm, confident, conversational, mid-30s, slight smile in the voice',
        description: 'How the voice should sound',
        example: 'warm, confident, conversational, mid-30s, slight smile in the voice',
        required: true,
      },
    ],
    optimizedFor: 'Generic',
    author: 'builtin',
    version: '1.0.0',
    language: 'en',
    example: {
      show_name: 'Ship It Weekly',
      show_promise: 'honest stories from indie founders about what actually made their first $10k',
      host: 'Deniz and Mark',
      voice_style: 'warm, confident, conversational, mid-30s, slight smile in the voice',
    },
    source: {
      library: 'PromtExpress OSS',
      templateId: 'audio/podcast-intro-voiceover',
      authors: ['SpicesFire'],
      license: 'MIT',
      url: SOURCE_URL,
    },
  }),
  buildTemplate({
    id: 'code/pull-request-review',
    name: 'Pull request review',
    description:
      'A structured code review that separates blocking issues from suggestions, backed by concrete failure scenarios or named invariants instead of vague style notes.',
    category: 'engineering',
    tags: ['code-review', 'pull-request'],
    prompt:
      'You are a meticulous staff engineer reviewing a pull request.\n\nPurpose of the change: {{purpose}}\nStack and conventions: {{stack}}\n\nDiff:\n```diff\n{{diff}}\n```\n\nReview in this order and use these exact headings:\n\n### Blocking\nIssues that must be fixed before merge: bugs, security issues, data loss, broken contracts. For each: file and line, what goes wrong, and one of:\n- a concrete input or sequence of events that triggers it, or\n- the invariant it violates (security boundary, concurrency or ordering guarantee, data-migration safety, architectural boundary) and the realistic consequence when it is violated.\nIf you can give neither, put it under Suggestions. Style and preference are never blocking.\n\n### Does it do what it says?\nCompare the diff with the stated purpose. Note anything missing, or anything unrelated that slipped in.\n\n### Suggestions\nSimplifications, clearer names, missing tests. Keep each to one or two sentences and include the replacement code when it is short.\n\n### Verdict\nOne of: Approve, Approve with nits, Request changes. Add a one-sentence reason.\n\nRules: review only what is in the diff, do not comment on formatting a linter would catch, and say "None" under a heading instead of padding it.',
    variables: [
      {
        name: 'diff',
        label: variableLabel('diff'),
        type: 'textarea',
        placeholder: 'diff --git a/src/cart.ts b/src/cart.ts ...',
        description: 'The unified diff of the pull request',
        example: 'diff --git a/src/cart.ts b/src/cart.ts ...',
        required: true,
      },
      {
        name: 'purpose',
        label: variableLabel('purpose'),
        type: 'text',
        placeholder: 'Apply percentage discount codes at checkout',
        description: 'What the PR is supposed to do',
        example: 'Apply percentage discount codes at checkout',
        required: true,
      },
      {
        name: 'stack',
        label: variableLabel('stack'),
        type: 'text',
        placeholder: 'Next.js 15, Prisma, Postgres; money stored as integer cents',
        description: 'Language, framework and anything reviewers should know',
        example: 'Next.js 15, Prisma, Postgres; money stored as integer cents',
        required: false,
      },
    ],
    optimizedFor: 'Generic',
    author: 'builtin',
    version: '1.1.0',
    language: 'en',
    example: {
      diff: '- const total = subtotal - subtotal * code.percent\n+ const total = Math.round(subtotal * (1 - code.percent / 100))',
      purpose: 'Apply percentage discount codes at checkout',
      stack: 'Next.js 15, Prisma, Postgres; money stored as integer cents',
    },
    source: {
      library: 'PromtExpress OSS',
      templateId: 'code/pull-request-review',
      authors: ['SpicesFire'],
      license: 'MIT',
      url: SOURCE_URL,
    },
  }),
  buildTemplate({
    id: 'code/sql-query-from-question',
    name: 'SQL Query from Question',
    description:
      'Convert a plain-language question and table schema into a readable SQL query with explicit assumptions, NULL handling, and join explanations.',
    category: 'database',
    tags: ['sql', 'database', 'data-analysis'],
    prompt:
      "You are an expert database engineer. Translate the user's natural language question into a clean, optimized, and correct SQL query targeting the specified dialect.\n\n### Inputs\n- Dialect: {{dialect}}\n- Schema:\n```sql\n{{schema}}\n```\n- Question: {{question}}\n\n### Rules & Constraints\n1. Target Dialect: Write syntax strictly valid for {{dialect}}.\n2. No SELECT *: Always specify column names explicitly; never use `SELECT *`.\n3. Handle NULLs Explicitly: Use COALESCE, IS NULL, or appropriate null-safe comparisons where values could be null.\n4. Join Annotations: Before or alongside each JOIN, provide a single-line comment explaining the relationship being joined.\n5. Readable Formatting: Use standard uppercase for SQL keywords and clean indentation.\n6. Assumptions: Clearly list any assumptions made about business logic, data types, or missing columns under an 'Assumptions' section.\n\n### Output Format\nProvide the response structured as:\n- **Assumptions**: Bullet list of assumptions.\n- **SQL Query**: The fenced code block containing the SQL query.\n- **Explanation**: Brief notes on join logic and null handling.",
    variables: [
      {
        name: 'question',
        label: variableLabel('question'),
        type: 'textarea',
        placeholder:
          'Find the top 5 customers by total spend in 2023 who have placed at least 3 orders.',
        description: 'The natural language question to be answered by SQL',
        example:
          'Find the top 5 customers by total spend in 2023 who have placed at least 3 orders.',
        required: true,
      },
      {
        name: 'schema',
        label: variableLabel('schema'),
        type: 'textarea',
        placeholder:
          'CREATE TABLE customers (id INT PRIMARY KEY, name VARCHAR(100));\nCREATE TABLE orders (id INT PRIMARY KEY, customer_id INT, order_date DATE, total_amount DECIMAL(10,2));',
        description: 'The relevant database schema, typically CREATE TABLE statements',
        example:
          'CREATE TABLE customers (id INT PRIMARY KEY, name VARCHAR(100));\nCREATE TABLE orders (id INT PRIMARY KEY, customer_id INT, order_date DATE, total_amount DECIMAL(10,2));',
        required: true,
      },
      {
        name: 'dialect',
        label: variableLabel('dialect'),
        type: 'text',
        placeholder: 'PostgreSQL',
        description: 'The SQL dialect to target (e.g., PostgreSQL, MySQL, SQLite)',
        example: 'PostgreSQL',
        required: true,
      },
    ],
    optimizedFor: 'Generic',
    author: 'builtin',
    version: '1.0.0',
    language: 'en',
    example: {
      question:
        'Find the top 5 customers by total spend in 2023 who have placed at least 3 orders.',
      schema:
        'CREATE TABLE customers (id INT PRIMARY KEY, name VARCHAR(100));\nCREATE TABLE orders (id INT PRIMARY KEY, customer_id INT, order_date DATE, total_amount DECIMAL(10,2));',
      dialect: 'PostgreSQL',
    },
    source: {
      library: 'PromtExpress OSS',
      templateId: 'code/sql-query-from-question',
      authors: ['resularabaci'],
      license: 'MIT',
      url: SOURCE_URL,
    },
  }),
  buildTemplate({
    id: 'code/unit-tests-for-function',
    name: 'Unit tests for a function',
    description:
      'Generates focused unit tests grounded in a specification when you have one: behaviors are tagged as specified, observed or assumed, so the model never invents the contract.',
    category: 'engineering',
    tags: ['testing', 'unit-tests'],
    prompt:
      'You are a senior engineer who writes tests that catch real bugs, not tests that restate the implementation.\n\nCode under test:\n```\n{{code}}\n```\n\nSpecification (authoritative; may be empty):\n"""\n{{specification}}\n"""\n\nFramework: {{framework}}\nMatch the style of this existing test (naming, assertion style, structure):\n```\n{{existing_test_example}}\n```\n\nProcess:\n1. First, list the function\'s observable behaviors in 3-8 bullets. Tag each one SPEC if the specification states it, OBSERVED if the current code does it and the specification is silent, or ASSUMED if neither covers it and you would be guessing the intent.\n2. List edge cases: empty and boundary inputs, unusual types or encodings, error paths, and anything order- or time-dependent.\n3. Then write the tests.\n\nTest rules:\n- Test behavior through the public interface only; do not assert on private helpers or call counts unless that is the contract.\n- One behavior per test, named as a sentence describing that behavior.\n- No mocks unless the code touches the network, filesystem, clock or randomness; when it does, control those explicitly.\n- Only SPEC behaviors may be asserted as correct. Pin OBSERVED behaviors as current behavior, with test names starting "currently". Do not write tests for ASSUMED behaviors; list them under "Questions for the author" instead.\n- If the code contradicts the specification, write the test for the specified behavior and mark it with a comment starting "SPEC VIOLATION:".\n\nOutput the tagged behavior list, the edge-case list, questions for the author (if any), then one complete, runnable test file.',
    variables: [
      {
        name: 'code',
        label: variableLabel('code'),
        type: 'textarea',
        placeholder: 'export function slugify(input: string): string { ... }',
        description: 'The function or module under test',
        example: 'export function slugify(input: string): string { ... }',
        required: true,
      },
      {
        name: 'specification',
        label: variableLabel('specification'),
        type: 'textarea',
        placeholder:
          'slugify must lowercase, trim, collapse every run of characters outside [a-z0-9] into a single hyphen and strip leading and trailing hyphens. Non-ASCII letters are removed, not transliterated.',
        description: 'Authoritative requirements for the code: ticket, docs or acceptance criteria',
        example:
          'slugify must lowercase, trim, collapse every run of characters outside [a-z0-9] into a single hyphen and strip leading and trailing hyphens. Non-ASCII letters are removed, not transliterated.',
        required: false,
      },
      {
        name: 'framework',
        label: variableLabel('framework'),
        type: 'text',
        placeholder: 'Vitest with TypeScript',
        description: 'Test framework and language',
        example: 'Vitest with TypeScript',
        required: true,
      },
      {
        name: 'existing_test_example',
        label: variableLabel('existing_test_example'),
        type: 'textarea',
        placeholder:
          "it('returns empty string for empty input', () => { expect(slugify('')).toBe('') })",
        description: 'A short existing test from the codebase, so style matches',
        example:
          "it('returns empty string for empty input', () => { expect(slugify('')).toBe('') })",
        required: false,
      },
    ],
    optimizedFor: 'Generic',
    author: 'builtin',
    version: '1.1.0',
    language: 'en',
    example: {
      code: "export function slugify(input: string): string {\n  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');\n}",
      specification:
        'slugify must lowercase, trim, collapse every run of characters outside [a-z0-9] into a single hyphen and strip leading and trailing hyphens. Non-ASCII letters are removed, not transliterated.',
      framework: 'Vitest with TypeScript',
      existing_test_example:
        "it('returns empty string for empty input', () => { expect(slugify('')).toBe('') })",
    },
    source: {
      library: 'PromtExpress OSS',
      templateId: 'code/unit-tests-for-function',
      authors: ['SpicesFire'],
      license: 'MIT',
      url: SOURCE_URL,
    },
  }),
  buildTemplate({
    id: 'image/social-post-with-headline',
    name: 'Social post with headline text',
    description:
      'Promotional social media graphic with exact headline and call-to-action text rendered legibly, for text-capable image models.',
    category: 'marketing',
    tags: ['social-media', 'typography', 'advertising'],
    prompt:
      'Promotional social media graphic, aspect ratio {{aspect_ratio}}.\n\nMAIN VISUAL: {{visual}}, occupying the lower two thirds, photographic, bright natural light.\nPRIMARY TEXT: "{{headline}}", large bold geometric sans-serif, top-center, high contrast against the background, generous letter spacing.\nSECONDARY TEXT: "{{cta}}", roughly one third the size of the primary text, directly below it, same typeface in regular weight.\nLAYOUT: clear hierarchy, text never overlaps the main visual, safe margin of at least 8% on every edge, clean negative space behind the text.\nCOLOR PALETTE: {{palette}}; use the darkest palette color for text if contrast requires it.\nTYPOGRAPHY RULES: render both text blocks exactly as written, correct spelling, no extra words, no garbled or duplicated letters.\n\nNegative: no additional text, no fake logos, no watermark, no people, no clutter, no borders or frames.',
    variables: [
      {
        name: 'headline',
        label: variableLabel('headline'),
        type: 'text',
        placeholder: 'Summer Sale',
        description: 'Exact headline text, short',
        example: 'Summer Sale',
        required: true,
      },
      {
        name: 'cta',
        label: variableLabel('cta'),
        type: 'text',
        placeholder: 'Up to 40% off, this week only',
        description: 'Exact call-to-action text',
        example: 'Up to 40% off, this week only',
        required: true,
      },
      {
        name: 'visual',
        label: variableLabel('visual'),
        type: 'text',
        placeholder: 'a stack of colorful folded beach towels on white sand',
        description: 'Main visual subject',
        example: 'a stack of colorful folded beach towels on white sand',
        required: true,
      },
      {
        name: 'palette',
        label: variableLabel('palette'),
        type: 'text',
        placeholder: 'coral, sand beige and deep teal',
        description: 'Brand colors',
        example: 'coral, sand beige and deep teal',
        required: true,
      },
      {
        name: 'aspect_ratio',
        label: variableLabel('aspect_ratio'),
        type: 'select',
        options: ['1:1', '4:5', '9:16'],
        placeholder: '1:1',
        description: '1:1 feed, 4:5 portrait or 9:16 story',
        example: '1:1',
        required: true,
      },
    ],
    optimizedFor: 'Generic',
    author: 'builtin',
    version: '1.0.0',
    language: 'en',
    example: {
      headline: 'Summer Sale',
      cta: 'Up to 40% off, this week only',
      visual: 'a stack of colorful folded beach towels on white sand',
      palette: 'coral, sand beige and deep teal',
      aspect_ratio: '1:1',
    },
    source: {
      library: 'PromtExpress OSS',
      templateId: 'image/social-post-with-headline',
      authors: ['SpicesFire'],
      license: 'MIT',
      url: SOURCE_URL,
    },
  }),
  buildTemplate({
    id: 'image/studio-product-photo',
    name: 'Studio product photo',
    description:
      'Clean e-commerce hero shot of a single product on a seamless background with controlled studio lighting.',
    category: 'ecommerce',
    tags: ['product', 'photography', 'packshot'],
    prompt:
      'Studio product photograph of a single {{product}}, centered, three-quarter view from slightly above eye level, the whole product in frame with generous margin.\n\nBackground: {{background}}, seamless, no horizon line, subtle natural contact shadow under the product.\nLighting: large softbox key light from upper left, white bounce card on the right to open the shadows, thin rim light from behind to separate edges; soft, even, no blown highlights, accurate color.\nCamera: 100mm macro lens, f/8, everything in sharp focus, true-to-life proportions, no lens distortion.\nStyle: premium e-commerce catalog, minimal, clean, realistic material texture.\nAspect ratio {{aspect_ratio}}.\n\nNegative: no people, no hands, no props, no text, no logos other than those on the product itself, no watermark, no reflections of the studio, no duplicated product, no floating objects.',
    variables: [
      {
        name: 'product',
        label: variableLabel('product'),
        type: 'text',
        placeholder: 'matte black ceramic coffee mug with a thin gold rim',
        description: 'The product, with material and color',
        example: 'matte black ceramic coffee mug with a thin gold rim',
        required: true,
      },
      {
        name: 'background',
        label: variableLabel('background'),
        type: 'text',
        placeholder: 'warm off-white seamless paper',
        description: 'Backdrop color and surface',
        example: 'warm off-white seamless paper',
        required: true,
      },
      {
        name: 'aspect_ratio',
        label: variableLabel('aspect_ratio'),
        type: 'text',
        placeholder: '4:5',
        description: 'Output aspect ratio',
        example: '4:5',
        required: true,
      },
    ],
    optimizedFor: 'Generic',
    author: 'builtin',
    version: '1.0.0',
    language: 'en',
    example: {
      product: 'matte black ceramic coffee mug with a thin gold rim',
      background: 'warm off-white seamless paper',
      aspect_ratio: '4:5',
    },
    source: {
      library: 'PromtExpress OSS',
      templateId: 'image/studio-product-photo',
      authors: ['SpicesFire'],
      license: 'MIT',
      url: SOURCE_URL,
    },
  }),
  buildTemplate({
    id: 'music/background-track-brief',
    name: 'Background track for video',
    description:
      'An instrumental music prompt that stays under dialogue: defined tempo, instrumentation, structure and mix, for Suno, Udio and similar tools.',
    category: 'content-creation',
    tags: ['instrumental', 'background-music', 'video'],
    prompt:
      'Instrumental {{genre}} track for {{use_case}}. Mood: {{mood}}. Tempo {{tempo_bpm}} BPM, steady and consistent throughout.\n\nInstrumentation: soft rhythmic foundation, warm bass, one simple melodic motif on a mellow lead; no vocals, no vocal chops, no spoken samples.\nStructure: 4-bar gentle intro, main groove that repeats with small variations every 8 bars so it can be looped or cut anywhere, a slight lift in the middle section, and a clean 2-bar resolved ending.\nMix: sit under a voice-over, mids kept clear between 1-4 kHz, no sudden drops, no loud risers, no hard stops, even dynamics.\n\nAvoid: lyrics, dramatic build-ups, dissonant or distracting solos, genre switches mid-track.',
    variables: [
      {
        name: 'use_case',
        label: variableLabel('use_case'),
        type: 'text',
        placeholder: 'a 90-second SaaS product walkthrough with voice-over',
        description: 'Where the music will play',
        example: 'a 90-second SaaS product walkthrough with voice-over',
        required: true,
      },
      {
        name: 'mood',
        label: variableLabel('mood'),
        type: 'text',
        placeholder: 'optimistic, focused, modern',
        description: 'Emotional direction',
        example: 'optimistic, focused, modern',
        required: true,
      },
      {
        name: 'genre',
        label: variableLabel('genre'),
        type: 'text',
        placeholder: 'lo-fi electronic with light organic percussion',
        description: 'Genre or reference style',
        example: 'lo-fi electronic with light organic percussion',
        required: true,
      },
      {
        name: 'tempo_bpm',
        label: variableLabel('tempo_bpm'),
        type: 'text',
        placeholder: '96',
        description: 'Tempo in beats per minute',
        example: '96',
        required: true,
      },
    ],
    optimizedFor: 'Generic',
    author: 'builtin',
    version: '1.0.0',
    language: 'en',
    example: {
      use_case: 'a 90-second SaaS product walkthrough with voice-over',
      mood: 'optimistic, focused, modern',
      genre: 'lo-fi electronic with light organic percussion',
      tempo_bpm: '96',
    },
    source: {
      library: 'PromtExpress OSS',
      templateId: 'music/background-track-brief',
      authors: ['SpicesFire'],
      license: 'MIT',
      url: SOURCE_URL,
    },
  }),
  buildTemplate({
    id: 'text/customer-support-reply',
    name: 'Customer Support Reply',
    description:
      'Draft an empathetic, policy-accurate reply to a customer support inquiry with clear guardrails.',
    category: 'customer-support',
    tags: ['customer-support', 'email', 'tone-of-voice'],
    prompt:
      "You are an expert customer support specialist. Your goal is to draft a clear, empathetic, and policy-compliant reply to a customer inquiry.\n\n### Inputs\n- Customer Message: {{customer_message}}\n- Relevant Policy: {{relevant_policy}}\n- Brand Voice: {{brand_voice}}\n- Resolution Offered: {{resolution_offered}}\n\n### Core Instructions\n1. Empathy & Tone: Acknowledge the customer's feelings sincerely while matching the specified Brand Voice.\n2. Clear Resolution: Clearly communicate the Resolution Offered and explain any next steps.\n3. Strict Policy Adherence: Base every claim, promise, and timeline strictly on the Relevant Policy.\n4. No Unauthorized Commitments: Never promise refunds, credits, discounts, or exceptions not explicitly permitted by the policy or resolution.\n5. Unresolved Issues: If the issue cannot be resolved within policy boundaries, state what can be done clearly and offer escalation.\n\nGenerate only the final, ready-to-send reply.",
    variables: [
      {
        name: 'customer_message',
        label: variableLabel('customer_message'),
        type: 'textarea',
        placeholder:
          "My order #1042 was supposed to arrive two days ago for my daughter's birthday. Tracking has not updated, and I'm very frustrated.",
        description: 'The incoming message or complaint from the customer',
        example:
          "My order #1042 was supposed to arrive two days ago for my daughter's birthday. Tracking has not updated, and I'm very frustrated.",
        required: true,
      },
      {
        name: 'relevant_policy',
        label: variableLabel('relevant_policy'),
        type: 'textarea',
        placeholder:
          'Shipments delayed more than 48 hours past the estimated delivery window qualify for a full refund of shipping charges. Standard replacement orders can be dispatched if tracking shows no movement for 5 consecutive business days.',
        description: 'The exact company policy terms governing this situation',
        example:
          'Shipments delayed more than 48 hours past the estimated delivery window qualify for a full refund of shipping charges. Standard replacement orders can be dispatched if tracking shows no movement for 5 consecutive business days.',
        required: true,
      },
      {
        name: 'brand_voice',
        label: variableLabel('brand_voice'),
        type: 'text',
        placeholder: 'Empathetic, apologetic, solution-focused, and warm.',
        description: 'The desired tone and style of communication',
        example: 'Empathetic, apologetic, solution-focused, and warm.',
        required: true,
      },
      {
        name: 'resolution_offered',
        label: variableLabel('resolution_offered'),
        type: 'textarea',
        placeholder:
          'Apologize sincerely, refund the express shipping fee, and initiate a carrier investigation to expedite package status.',
        description: 'The specific resolution or next steps provided to the customer',
        example:
          'Apologize sincerely, refund the express shipping fee, and initiate a carrier investigation to expedite package status.',
        required: true,
      },
    ],
    optimizedFor: 'Generic',
    author: 'builtin',
    version: '1.0.0',
    language: 'en',
    example: {
      customer_message:
        "My order #1042 was supposed to arrive two days ago for my daughter's birthday. Tracking has not updated, and I'm very frustrated.",
      relevant_policy:
        'Shipments delayed more than 48 hours past the estimated delivery window qualify for a full refund of shipping charges. Standard replacement orders can be dispatched if tracking shows no movement for 5 consecutive business days.',
      brand_voice: 'Empathetic, apologetic, solution-focused, and warm.',
      resolution_offered:
        'Apologize sincerely, refund the express shipping fee, and initiate a carrier investigation to expedite package status.',
    },
    source: {
      library: 'PromtExpress OSS',
      templateId: 'text/customer-support-reply',
      authors: ['resularabaci'],
      license: 'MIT',
      url: SOURCE_URL,
    },
  }),
  buildTemplate({
    id: 'text/meeting-notes-to-action-items',
    name: 'Meeting notes to action items',
    description:
      'Turns messy meeting notes or a transcript into decisions, owners, deadlines and open questions, without inventing anything.',
    category: 'productivity',
    tags: ['meetings', 'summarization', 'project-management'],
    prompt:
      'You are an experienced chief of staff who turns meeting notes into a record people can act on.\n\nContext: {{team_context}}\n\nNotes:\n"""\n{{notes}}\n"""\n\nProduce exactly these sections in Markdown:\n\n## Decisions\nBullet list of what was actually decided. If nothing was decided, write "None recorded".\n\n## Action items\nA table with columns: Action | Owner | Deadline | Source quote.\n- Start every action with a verb.\n- Owner and deadline must come from the notes. If missing, write "Unassigned" or "No date"; never guess.\n- "Source quote" is the shortest phrase from the notes that supports the item.\n\n## Open questions\nThings raised but not resolved, each with who is best placed to answer if the notes say so.\n\n## Risks\nOnly risks explicitly mentioned or directly implied by a slipped deadline or blocker.\n\nRules: do not add information that is not in the notes, keep the original language of names and product terms, and stay under 300 words outside the table.',
    variables: [
      {
        name: 'notes',
        label: variableLabel('notes'),
        type: 'textarea',
        placeholder:
          'Ali: landing page slips to Friday, waiting on copy. Zeynep owns copy. Pricing still undecided...',
        description: 'Raw notes or transcript',
        example:
          'Ali: landing page slips to Friday, waiting on copy. Zeynep owns copy. Pricing still undecided...',
        required: true,
      },
      {
        name: 'team_context',
        label: variableLabel('team_context'),
        type: 'textarea',
        placeholder: 'Weekly sync for the Q4 website relaunch; marketing + two engineers',
        description: 'Who was in the meeting and what the project is',
        example: 'Weekly sync for the Q4 website relaunch; marketing + two engineers',
        required: false,
      },
    ],
    optimizedFor: 'Generic',
    author: 'builtin',
    version: '1.0.0',
    language: 'en',
    example: {
      notes:
        'Ali: landing page slips to Friday, waiting on copy. Zeynep owns copy, says Wednesday. Pricing still undecided, Kerem to bring two options next week. Analytics broken on checkout since Monday.',
      team_context: 'Weekly sync for the Q4 website relaunch',
    },
    source: {
      library: 'PromtExpress OSS',
      templateId: 'text/meeting-notes-to-action-items',
      authors: ['SpicesFire'],
      license: 'MIT',
      url: SOURCE_URL,
    },
  }),
  buildTemplate({
    id: 'text/product-description-ecommerce',
    name: 'E-commerce product description',
    description:
      'Benefit-led product page copy with a scannable spec list and SEO title, grounded only in the facts you provide.',
    category: 'ecommerce',
    tags: ['copywriting', 'seo', 'product-page'],
    prompt:
      'You are a senior e-commerce copywriter. Write the product page copy for "{{product_name}}".\n\nVerified facts (use only these; do not invent certifications, awards, reviews or numbers):\n{{facts}}\n\nTarget customer: {{audience}}\nBrand voice: {{brand_voice}}\n\nDeliver:\n1. SEO title: max 60 characters, product name first.\n2. Meta description: max 155 characters, one clear benefit and a soft call to action.\n3. Hook: one sentence describing the moment the customer enjoys the product, not its features.\n4. Body: 2 short paragraphs (max 90 words total). Translate each fact into what it means for the customer.\n5. Details: a bullet list of the facts, one per line, precise and unembellished.\n\nAvoid: "high quality", "perfect for everyone", superlatives you cannot prove, and more than one adjective in a row.',
    variables: [
      {
        name: 'product_name',
        label: variableLabel('product_name'),
        type: 'text',
        placeholder: 'Arcadia Linen Duvet Cover',
        description: 'Product name as it appears in the store',
        example: 'Arcadia Linen Duvet Cover',
        required: true,
      },
      {
        name: 'facts',
        label: variableLabel('facts'),
        type: 'textarea',
        placeholder:
          '100% stonewashed European linen; queen and king; hidden button closure; machine wash 40°C',
        description: 'Materials, sizes, features, care instructions: anything verifiable',
        example:
          '100% stonewashed European linen; queen and king; hidden button closure; machine wash 40°C',
        required: true,
      },
      {
        name: 'audience',
        label: variableLabel('audience'),
        type: 'textarea',
        placeholder: 'Couples furnishing their first home who want a relaxed, hotel-like bedroom',
        description: 'Who buys this and why',
        example: 'Couples furnishing their first home who want a relaxed, hotel-like bedroom',
        required: true,
      },
      {
        name: 'brand_voice',
        label: variableLabel('brand_voice'),
        type: 'text',
        placeholder: 'warm, understated, no exclamation marks',
        description: 'Tone of the store',
        example: 'warm, understated, no exclamation marks',
        required: false,
      },
    ],
    optimizedFor: 'Generic',
    author: 'builtin',
    version: '1.0.0',
    language: 'en',
    example: {
      product_name: 'Arcadia Linen Duvet Cover',
      facts:
        '100% stonewashed European linen; queen and king; hidden button closure; machine wash 40°C',
      audience: 'Couples furnishing their first home who want a relaxed, hotel-like bedroom',
      brand_voice: 'warm, understated, no exclamation marks',
    },
    source: {
      library: 'PromtExpress OSS',
      templateId: 'text/product-description-ecommerce',
      authors: ['SpicesFire'],
      license: 'MIT',
      url: SOURCE_URL,
    },
  }),
  buildTemplate({
    id: 'text/urun-aciklamasi-eticaret',
    name: 'E-ticaret ürün açıklaması',
    description:
      'Yalnızca verdiğiniz bilgilere dayanan, fayda odaklı ürün sayfası metni, taranabilir özellik listesi ve SEO başlığı.',
    category: 'ecommerce',
    tags: ['copywriting', 'seo', 'product-page'],
    prompt:
      'Kıdemli bir e-ticaret metin yazarısın. "{{urun_adi}}" için ürün sayfası metnini yaz.\n\nDoğrulanmış bilgiler (yalnızca bunları kullan; sertifika, ödül, yorum veya rakam uydurma):\n{{bilgiler}}\n\nHedef müşteri: {{hedef_kitle}}\nMarka sesi: {{marka_sesi}}\n\nTeslim et:\n1. SEO başlığı: en fazla 60 karakter, ürün adı başta.\n2. Meta açıklama: en fazla 155 karakter, tek net fayda ve yumuşak bir harekete geçirici ifade.\n3. Kanca: Müşterinin ürünün keyfini sürdüğü anı anlatan tek cümle; özellik değil, deneyim.\n4. Gövde: 2 kısa paragraf (toplam en fazla 90 kelime). Her bilgiyi müşteri için ne anlama geldiğine çevir.\n5. Detaylar: Bilgilerin madde listesi, satır başına bir tane, net ve süssüz.\n\nKaçın: "yüksek kalite", "herkes için mükemmel", kanıtlanamayan üstünlük ifadeleri ve art arda birden fazla sıfat. Doğal, akıcı Türkçe kullan; çeviri kokan kalıplardan kaçın.',
    variables: [
      {
        name: 'urun_adi',
        label: variableLabel('urun_adi'),
        type: 'text',
        placeholder: 'Arcadia Keten Nevresim Takımı',
        description: 'Mağazada görünen ürün adı',
        example: 'Arcadia Keten Nevresim Takımı',
        required: true,
      },
      {
        name: 'bilgiler',
        label: variableLabel('bilgiler'),
        type: 'textarea',
        placeholder:
          "%100 taş yıkamalı Avrupa keteni; çift ve king size; gizli düğmeli kapama; 40°C'de makinede yıkanabilir",
        description: 'Malzeme, ölçü, özellik, bakım talimatı gibi doğrulanabilir bilgiler',
        example:
          "%100 taş yıkamalı Avrupa keteni; çift ve king size; gizli düğmeli kapama; 40°C'de makinede yıkanabilir",
        required: true,
      },
      {
        name: 'hedef_kitle',
        label: variableLabel('hedef_kitle'),
        type: 'textarea',
        placeholder: 'İlk evini döşeyen, rahat ve otel havasında bir yatak odası isteyen çiftler',
        description: 'Kim, neden satın alıyor',
        example: 'İlk evini döşeyen, rahat ve otel havasında bir yatak odası isteyen çiftler',
        required: true,
      },
      {
        name: 'marka_sesi',
        label: variableLabel('marka_sesi'),
        type: 'text',
        placeholder: 'sıcak, sade, ünlem işareti yok',
        description: 'Mağazanın üslubu',
        example: 'sıcak, sade, ünlem işareti yok',
        required: false,
      },
    ],
    optimizedFor: 'Generic',
    author: 'builtin',
    version: '1.0.0',
    language: 'tr',
    example: {
      urun_adi: 'Arcadia Keten Nevresim Takımı',
      bilgiler:
        "%100 taş yıkamalı Avrupa keteni; çift ve king size; gizli düğmeli kapama; 40°C'de makinede yıkanabilir",
      hedef_kitle: 'İlk evini döşeyen, rahat ve otel havasında bir yatak odası isteyen çiftler',
      marka_sesi: 'sıcak, sade, ünlem işareti yok',
    },
    source: {
      library: 'PromtExpress OSS',
      templateId: 'text/urun-aciklamasi-eticaret',
      authors: ['SpicesFire'],
      license: 'MIT',
      url: SOURCE_URL,
    },
  }),
  buildTemplate({
    id: 'video/vertical-product-ad',
    name: 'Vertical product ad (Reels / TikTok)',
    description:
      'Short 9:16 product video with a hook in the first second, a clear beat structure and an end card, for text-to-video models.',
    category: 'marketing',
    tags: ['advertising', 'short-form', 'product'],
    prompt:
      "A {{duration_seconds}}-second vertical 9:16 product video of {{product}} in {{setting}}.\n\nSeconds 0-1 (hook): extreme close-up with fast push-in on {{product}} as it enters frame, instantly recognizable.\nMiddle: handheld medium shot of a person using it naturally; the action builds to {{key_moment}}, shown clearly in a slow-motion beat.\nFinal 2 seconds: static centered hero shot of the product on a clean surface, gentle light sweep across it, empty space in the top third reserved for an end-card logo added in editing.\n\nCamera: smooth gimbal movement, shallow depth of field, 35mm look.\nLighting: warm natural key light, soft rim light on the product, realistic reflections.\nMood: energetic, authentic, premium but not glossy.\nAudio: upbeat ambient sound design matching the setting, no dialogue, no voice-over.\n\nAvoid: on-screen text, watermarks, visible brand names other than the product's own, distorted hands, flickering, morphing product shape, abrupt cuts between unrelated scenes.",
    variables: [
      {
        name: 'product',
        label: variableLabel('product'),
        type: 'text',
        placeholder: 'a translucent orange insulated water bottle',
        description: 'The product and its key visual trait',
        example: 'a translucent orange insulated water bottle',
        required: true,
      },
      {
        name: 'setting',
        label: variableLabel('setting'),
        type: 'text',
        placeholder: 'a sunny rooftop gym at golden hour',
        description: 'Where the action happens',
        example: 'a sunny rooftop gym at golden hour',
        required: true,
      },
      {
        name: 'key_moment',
        label: variableLabel('key_moment'),
        type: 'text',
        placeholder: 'ice cubes still rattling inside after a full workout',
        description: 'The single action that shows the benefit',
        example: 'ice cubes still rattling inside after a full workout',
        required: true,
      },
      {
        name: 'duration_seconds',
        label: variableLabel('duration_seconds'),
        type: 'text',
        placeholder: '8',
        description: 'Total length; most models handle 5-10 seconds best',
        example: '8',
        required: true,
      },
    ],
    optimizedFor: 'Generic',
    author: 'builtin',
    version: '1.0.0',
    language: 'en',
    example: {
      product: 'a translucent orange insulated water bottle',
      setting: 'a sunny rooftop gym at golden hour',
      key_moment: 'ice cubes still rattling inside after a full workout',
      duration_seconds: '8',
    },
    source: {
      library: 'PromtExpress OSS',
      templateId: 'video/vertical-product-ad',
      authors: ['SpicesFire'],
      license: 'MIT',
      url: SOURCE_URL,
    },
  }),
]

export const CATEGORY_LABELS: Record<PromptTemplate['category'], string> = {
  engineering: 'Engineering',
  database: 'Database',
  marketing: 'Marketing',
  ecommerce: 'E-commerce',
  'customer-support': 'Customer Support',
  'content-creation': 'Content Creation',
  productivity: 'Productivity',
}

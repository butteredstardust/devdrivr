-- Return user prompt templates to a category the schema accepts.
--
-- Version 18 is deliberately skipped. A withdrawn migration held that number and remapped
-- categories. Databases that ran it record 18 as applied, so a new migration numbered 18 would
-- never run on them.
--
-- `promptTemplateRowSchema` rejects a row on an unknown category, and `loadUserPromptTemplates`
-- drops a rejected row. The template then disappears from the library with no message. The original
-- category cannot be recovered, because the remap collapsed four categories into one. Keeping the
-- template under a wrong category is better than losing it.
UPDATE user_prompt_templates
SET category = 'productivity'
WHERE category NOT IN (
  'code-review',
  'refactoring',
  'testing',
  'docs',
  'debugging',
  'security',
  'learning',
  'productivity'
);

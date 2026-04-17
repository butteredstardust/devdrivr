ALTER TABLE user_prompt_templates ADD COLUMN author TEXT NOT NULL DEFAULT 'user';

UPDATE user_prompt_templates
SET author = 'user'
WHERE author IS NULL OR author = '';

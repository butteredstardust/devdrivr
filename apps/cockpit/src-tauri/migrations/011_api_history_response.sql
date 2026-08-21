-- Keep a capped text snapshot of API responses in request history. Existing rows remain valid.
ALTER TABLE history ADD COLUMN response_body TEXT;
ALTER TABLE history ADD COLUMN response_mime_type TEXT;
ALTER TABLE history ADD COLUMN response_status INTEGER;
ALTER TABLE history ADD COLUMN response_status_text TEXT;

-- Convert prompt from plain text to JSON locale map { "en": "<old value>" }
ALTER TABLE "TieBreakerQuestion"
  ALTER COLUMN "prompt" TYPE JSONB
  USING jsonb_build_object('en', "prompt");

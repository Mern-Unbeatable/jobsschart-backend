-- Community questions: subject, question, answer, topic → JSON { en, nl }

ALTER TABLE "community_questions"
  ALTER COLUMN "subject" TYPE JSONB USING jsonb_build_object('en', "subject", 'nl', "subject"),
  ALTER COLUMN "question" TYPE JSONB USING CASE
    WHEN "question" IS NULL THEN NULL
    ELSE jsonb_build_object('en', "question", 'nl', "question")
  END,
  ALTER COLUMN "answer" TYPE JSONB USING CASE
    WHEN "answer" IS NULL THEN NULL
    ELSE jsonb_build_object('en', "answer", 'nl', "answer")
  END,
  ALTER COLUMN "topic" TYPE JSONB USING CASE
    WHEN "topic" IS NULL THEN NULL
    ELSE jsonb_build_object('en', "topic", 'nl', "topic")
  END;

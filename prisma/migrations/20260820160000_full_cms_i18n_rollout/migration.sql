-- Full CMS i18n rollout: Donation, Post, Comment, Review, Consultant, ConsultantQuery

-- Donations
ALTER TABLE "donations"
  ALTER COLUMN "description" TYPE JSONB USING CASE
    WHEN "description" IS NULL THEN NULL
    ELSE jsonb_build_object('en', "description", 'nl', "description")
  END,
  ALTER COLUMN "location" TYPE JSONB USING CASE
    WHEN "location" IS NULL THEN NULL
    ELSE jsonb_build_object('en', "location", 'nl', "location")
  END,
  ALTER COLUMN "benefit" TYPE JSONB USING jsonb_build_object('en', "benefit", 'nl', "benefit");

-- Posts
ALTER TABLE "Post"
  ALTER COLUMN "title" TYPE JSONB USING CASE
    WHEN "title" IS NULL THEN NULL
    ELSE jsonb_build_object('en', "title", 'nl', "title")
  END,
  ALTER COLUMN "content" TYPE JSONB USING jsonb_build_object('en', "content", 'nl', "content"),
  ALTER COLUMN "category" TYPE JSONB USING CASE
    WHEN "category" IS NULL THEN NULL
    ELSE jsonb_build_object('en', "category", 'nl', "category")
  END,
  ALTER COLUMN "subCategory" TYPE JSONB USING CASE
    WHEN "subCategory" IS NULL THEN NULL
    ELSE jsonb_build_object('en', "subCategory", 'nl', "subCategory")
  END;

-- Comments
ALTER TABLE "Comment"
  ALTER COLUMN "content" TYPE JSONB USING jsonb_build_object('en', "content", 'nl', "content");

-- Reviews
ALTER TABLE "reviews"
  ALTER COLUMN "comment" TYPE JSONB USING CASE
    WHEN "comment" IS NULL THEN NULL
    ELSE jsonb_build_object('en', "comment", 'nl', "comment")
  END;

-- Consultants: merge bio + bioNl → bio Json; specialization / category / topics → Json
ALTER TABLE "consultants"
  ALTER COLUMN "bio" TYPE JSONB USING CASE
    WHEN "bio" IS NULL AND "bioNl" IS NULL THEN NULL
    ELSE jsonb_build_object(
      'en', COALESCE("bio", "bioNl"),
      'nl', COALESCE("bioNl", "bio")
    )
  END;

ALTER TABLE "consultants" DROP COLUMN IF EXISTS "bioNl";

ALTER TABLE "consultants"
  ALTER COLUMN "specialization" TYPE JSONB USING jsonb_build_object(
    'en', to_jsonb("specialization"),
    'nl', to_jsonb("specialization")
  ),
  ALTER COLUMN "specialization" SET DEFAULT '{"en":[],"nl":[]}'::jsonb;

ALTER TABLE "consultants"
  ALTER COLUMN "category" TYPE JSONB USING CASE
    WHEN "category" IS NULL THEN NULL
    ELSE jsonb_build_object('en', "category", 'nl', "category")
  END,
  ALTER COLUMN "topics" TYPE JSONB USING CASE
    WHEN "topics" IS NULL THEN NULL
    ELSE jsonb_build_object('en', "topics", 'nl', "topics")
  END;

-- Consultant queries
ALTER TABLE "consultant_queries"
  ALTER COLUMN "subject" TYPE JSONB USING jsonb_build_object('en', "subject", 'nl', "subject"),
  ALTER COLUMN "question" TYPE JSONB USING jsonb_build_object('en', "question", 'nl', "question"),
  ALTER COLUMN "answer" TYPE JSONB USING CASE
    WHEN "answer" IS NULL THEN NULL
    ELSE jsonb_build_object('en', "answer", 'nl', "answer")
  END,
  ALTER COLUMN "answerHtml" TYPE JSONB USING CASE
    WHEN "answerHtml" IS NULL THEN NULL
    ELSE jsonb_build_object('en', "answerHtml", 'nl', "answerHtml")
  END;

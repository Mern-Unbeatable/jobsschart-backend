-- Convert CMS text columns to JSON { en, nl } without dropping data.

ALTER TABLE "activities"
  ALTER COLUMN "title" TYPE JSONB USING jsonb_build_object('en', "title", 'nl', "title"),
  ALTER COLUMN "description" TYPE JSONB USING jsonb_build_object('en', "description", 'nl', "description"),
  ALTER COLUMN "hostTitle" TYPE JSONB USING CASE WHEN "hostTitle" IS NULL THEN NULL ELSE jsonb_build_object('en', "hostTitle", 'nl', "hostTitle") END,
  ALTER COLUMN "location" TYPE JSONB USING CASE WHEN "location" IS NULL THEN NULL ELSE jsonb_build_object('en', "location", 'nl', "location") END,
  ALTER COLUMN "duration" TYPE JSONB USING CASE WHEN "duration" IS NULL THEN NULL ELSE jsonb_build_object('en', "duration", 'nl', "duration") END;

ALTER TABLE "blogs"
  ALTER COLUMN "title" TYPE JSONB USING CASE WHEN "title" IS NULL THEN NULL ELSE jsonb_build_object('en', "title", 'nl', "title") END,
  ALTER COLUMN "content" TYPE JSONB USING CASE WHEN "content" IS NULL THEN NULL ELSE jsonb_build_object('en', "content", 'nl', "content") END,
  ALTER COLUMN "excerpt" TYPE JSONB USING CASE WHEN "excerpt" IS NULL THEN NULL ELSE jsonb_build_object('en', "excerpt", 'nl', "excerpt") END,
  ALTER COLUMN "metaTitle" TYPE JSONB USING CASE WHEN "metaTitle" IS NULL THEN NULL ELSE jsonb_build_object('en', "metaTitle", 'nl', "metaTitle") END,
  ALTER COLUMN "metaDescription" TYPE JSONB USING CASE WHEN "metaDescription" IS NULL THEN NULL ELSE jsonb_build_object('en', "metaDescription", 'nl', "metaDescription") END;

ALTER TABLE "blog_categories"
  ALTER COLUMN "name" TYPE JSONB USING jsonb_build_object('en', "name", 'nl', "name");

ALTER TABLE "faqs"
  ALTER COLUMN "question" TYPE JSONB USING jsonb_build_object('en', "question", 'nl', "question"),
  ALTER COLUMN "answer" TYPE JSONB USING jsonb_build_object('en', "answer", 'nl', "answer");

ALTER TABLE "packages"
  ALTER COLUMN "name" TYPE JSONB USING jsonb_build_object('en', "name", 'nl', "name"),
  ALTER COLUMN "description" TYPE JSONB USING CASE WHEN "description" IS NULL THEN NULL ELSE jsonb_build_object('en', "description", 'nl', "description") END;

ALTER TABLE "packages" ALTER COLUMN "features" DROP DEFAULT;
ALTER TABLE "packages"
  ALTER COLUMN "features" TYPE JSONB USING jsonb_build_object('en', to_jsonb("features"), 'nl', to_jsonb("features"));
ALTER TABLE "packages" ALTER COLUMN "features" SET DEFAULT '{"en":[],"nl":[]}'::jsonb;

ALTER TABLE "ad_campaigns"
  ALTER COLUMN "title" TYPE JSONB USING jsonb_build_object('en', "title", 'nl', "title"),
  ALTER COLUMN "description" TYPE JSONB USING CASE WHEN "description" IS NULL THEN NULL ELSE jsonb_build_object('en', "description", 'nl', "description") END;

ALTER TABLE "products"
  ALTER COLUMN "name" TYPE JSONB USING jsonb_build_object('en', "name", 'nl', "name"),
  ALTER COLUMN "description" TYPE JSONB USING jsonb_build_object('en', "description", 'nl', "description"),
  ALTER COLUMN "subTitle" TYPE JSONB USING CASE WHEN "subTitle" IS NULL THEN NULL ELSE jsonb_build_object('en', "subTitle", 'nl', "subTitle") END;

ALTER TABLE "products" ALTER COLUMN "features" DROP DEFAULT;
ALTER TABLE "products" ALTER COLUMN "whatsInside" DROP DEFAULT;
ALTER TABLE "products" ALTER COLUMN "benefits" DROP DEFAULT;
ALTER TABLE "products"
  ALTER COLUMN "features" TYPE JSONB USING jsonb_build_object('en', to_jsonb("features"), 'nl', to_jsonb("features")),
  ALTER COLUMN "whatsInside" TYPE JSONB USING jsonb_build_object('en', to_jsonb("whatsInside"), 'nl', to_jsonb("whatsInside")),
  ALTER COLUMN "benefits" TYPE JSONB USING jsonb_build_object('en', to_jsonb("benefits"), 'nl', to_jsonb("benefits"));
ALTER TABLE "products" ALTER COLUMN "features" SET DEFAULT '{"en":[],"nl":[]}'::jsonb;
ALTER TABLE "products" ALTER COLUMN "whatsInside" SET DEFAULT '{"en":[],"nl":[]}'::jsonb;
ALTER TABLE "products" ALTER COLUMN "benefits" SET DEFAULT '{"en":[],"nl":[]}'::jsonb;

ALTER TABLE "ProductCategory" DROP CONSTRAINT IF EXISTS "ProductCategory_name_key";
DROP INDEX IF EXISTS "ProductCategory_name_key";
ALTER TABLE "ProductCategory"
  ALTER COLUMN "name" TYPE JSONB USING jsonb_build_object('en', "name", 'nl', "name");

ALTER TABLE "categories"
  ALTER COLUMN "name" TYPE JSONB USING jsonb_build_object('en', "name", 'nl', "name");

ALTER TABLE "topics"
  ALTER COLUMN "name" TYPE JSONB USING jsonb_build_object('en', "name", 'nl', "name");

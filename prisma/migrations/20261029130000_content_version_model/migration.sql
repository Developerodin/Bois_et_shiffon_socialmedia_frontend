-- Which AI model wrote each draft version: approval rate per model (npm run usage)
ALTER TABLE "ContentVersion" ADD COLUMN "model" TEXT;

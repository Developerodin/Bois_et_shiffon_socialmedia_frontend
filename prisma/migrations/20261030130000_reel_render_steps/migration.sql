-- AlterEnum
BEGIN;
CREATE TYPE "ReelRenderStep_new" AS ENUM ('VOICE', 'CLIPS', 'JOIN', 'DONE', 'FAILED');
ALTER TABLE "ReelRender" ALTER COLUMN "step" DROP DEFAULT;
ALTER TABLE "ReelRender" ALTER COLUMN "step" TYPE "ReelRenderStep_new" USING ("step"::text::"ReelRenderStep_new");
ALTER TYPE "ReelRenderStep" RENAME TO "ReelRenderStep_old";
ALTER TYPE "ReelRenderStep_new" RENAME TO "ReelRenderStep";
DROP TYPE "ReelRenderStep_old";
ALTER TABLE "ReelRender" ALTER COLUMN "step" SET DEFAULT 'VOICE';
COMMIT;

-- AlterTable
ALTER TABLE "ReelRender" DROP COLUMN "ticks";


-- CreateEnum
CREATE TYPE "Plano" AS ENUM ('FREEMIUM', 'ESSENCIAL', 'PROFISSIONAL', 'ESCALA');

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "emailVerificado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailVerificationExpires" TIMESTAMP(3),
ADD COLUMN     "emailVerificationToken" TEXT,
ADD COLUMN     "onboarded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordResetExpires" TIMESTAMP(3),
ADD COLUMN     "passwordResetToken" TEXT,
ADD COLUMN     "plano" "Plano" NOT NULL DEFAULT 'FREEMIUM';

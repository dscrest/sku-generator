-- AlterTable
ALTER TABLE "SKUItem" ADD COLUMN     "zohoItemId" TEXT;

-- CreateTable
CREATE TABLE "ZohoToken" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "orgId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZohoToken_pkey" PRIMARY KEY ("id")
);

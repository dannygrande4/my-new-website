-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "spotifyAccessToken" TEXT,
ADD COLUMN "spotifyRefreshToken" TEXT,
ADD COLUMN "spotifyTokenExpiry" TIMESTAMP(3);

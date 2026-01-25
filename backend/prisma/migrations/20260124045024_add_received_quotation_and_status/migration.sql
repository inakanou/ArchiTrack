-- CreateEnum
CREATE TYPE "EstimateRequestStatus" AS ENUM ('BEFORE_REQUEST', 'REQUESTED', 'QUOTATION_RECEIVED');

-- CreateEnum
CREATE TYPE "ReceivedQuotationContentType" AS ENUM ('TEXT', 'FILE');

-- AlterTable
ALTER TABLE "estimate_requests" ADD COLUMN     "status" "EstimateRequestStatus" NOT NULL DEFAULT 'BEFORE_REQUEST';

-- CreateTable
CREATE TABLE "received_quotations" (
    "id" TEXT NOT NULL,
    "estimateRequestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "submittedAt" DATE NOT NULL,
    "contentType" "ReceivedQuotationContentType" NOT NULL,
    "textContent" TEXT,
    "filePath" TEXT,
    "fileName" TEXT,
    "fileMimeType" TEXT,
    "fileSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "received_quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_request_status_histories" (
    "id" TEXT NOT NULL,
    "estimateRequestId" TEXT NOT NULL,
    "fromStatus" "EstimateRequestStatus",
    "toStatus" "EstimateRequestStatus" NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_request_status_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "received_quotations_estimateRequestId_idx" ON "received_quotations"("estimateRequestId");

-- CreateIndex
CREATE INDEX "received_quotations_deletedAt_idx" ON "received_quotations"("deletedAt");

-- CreateIndex
CREATE INDEX "received_quotations_createdAt_idx" ON "received_quotations"("createdAt");

-- CreateIndex
CREATE INDEX "estimate_request_status_histories_estimateRequestId_idx" ON "estimate_request_status_histories"("estimateRequestId");

-- CreateIndex
CREATE INDEX "estimate_request_status_histories_changedAt_idx" ON "estimate_request_status_histories"("changedAt");

-- CreateIndex
CREATE INDEX "estimate_requests_status_idx" ON "estimate_requests"("status");

-- AddForeignKey
ALTER TABLE "received_quotations" ADD CONSTRAINT "received_quotations_estimateRequestId_fkey" FOREIGN KEY ("estimateRequestId") REFERENCES "estimate_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_request_status_histories" ADD CONSTRAINT "estimate_request_status_histories_estimateRequestId_fkey" FOREIGN KEY ("estimateRequestId") REFERENCES "estimate_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_request_status_histories" ADD CONSTRAINT "estimate_request_status_histories_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

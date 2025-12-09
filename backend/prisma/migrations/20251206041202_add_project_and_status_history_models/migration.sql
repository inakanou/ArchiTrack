-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PREPARING', 'SURVEYING', 'ESTIMATING', 'APPROVING', 'CONTRACTING', 'CONSTRUCTING', 'DELIVERING', 'BILLING', 'AWAITING', 'COMPLETED', 'CANCELLED', 'LOST');

-- CreateEnum
CREATE TYPE "TransitionType" AS ENUM ('initial', 'forward', 'backward', 'terminate');

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "salesPersonId" TEXT NOT NULL,
    "constructionPersonId" TEXT,
    "siteAddress" TEXT,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PREPARING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_status_histories" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromStatus" "ProjectStatus",
    "toStatus" "ProjectStatus" NOT NULL,
    "transitionType" "TransitionType" NOT NULL,
    "reason" TEXT,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_status_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_name_idx" ON "projects"("name");

-- CreateIndex
CREATE INDEX "projects_customerName_idx" ON "projects"("customerName");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "projects_salesPersonId_idx" ON "projects"("salesPersonId");

-- CreateIndex
CREATE INDEX "projects_createdAt_idx" ON "projects"("createdAt");

-- CreateIndex
CREATE INDEX "projects_updatedAt_idx" ON "projects"("updatedAt");

-- CreateIndex
CREATE INDEX "projects_deletedAt_idx" ON "projects"("deletedAt");

-- CreateIndex
CREATE INDEX "project_status_histories_projectId_idx" ON "project_status_histories"("projectId");

-- CreateIndex
CREATE INDEX "project_status_histories_changedAt_idx" ON "project_status_histories"("changedAt");

-- CreateIndex
CREATE INDEX "project_status_histories_transitionType_idx" ON "project_status_histories"("transitionType");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_salesPersonId_fkey" FOREIGN KEY ("salesPersonId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_constructionPersonId_fkey" FOREIGN KEY ("constructionPersonId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_status_histories" ADD CONSTRAINT "project_status_histories_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_status_histories" ADD CONSTRAINT "project_status_histories_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

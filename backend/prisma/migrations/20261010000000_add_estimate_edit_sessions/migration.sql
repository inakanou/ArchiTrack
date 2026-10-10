-- 見積書の編集セッション（在席情報、estimate-creation REQ-11.7）。
-- 見積書詳細画面を開いている利用者ごとに 1 行を持ち、画面が一定間隔で lastSeenAt を更新する。
-- 既存の表は変更しない純追加の移行である。

-- CreateTable
CREATE TABLE "estimate_edit_sessions" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_edit_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estimate_edit_sessions_estimateId_lastSeenAt_idx" ON "estimate_edit_sessions"("estimateId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "estimate_edit_sessions_userId_idx" ON "estimate_edit_sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "estimate_edit_sessions_estimateId_userId_key" ON "estimate_edit_sessions"("estimateId", "userId");

-- AddForeignKey
ALTER TABLE "estimate_edit_sessions" ADD CONSTRAINT "estimate_edit_sessions_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_edit_sessions" ADD CONSTRAINT "estimate_edit_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


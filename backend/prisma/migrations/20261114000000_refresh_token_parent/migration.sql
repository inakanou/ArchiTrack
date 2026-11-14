-- リフレッシュトークンの置き換えの直後の猶予（user-authentication の要件33.6 の改訂・33.13、タスク69.1）
-- ローテーションの後継に置き換え前の行の ID を記録する。既存の行は NULL のまま（改訂前に置き換えられた行は
-- 全て猶予の 10 秒を過ぎているため、移行の扱いは要らない）。外部キーは持たない（置き換え前の行は有効期限の
-- 掃除で先に消えうるため）。

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN "parent_id" TEXT;

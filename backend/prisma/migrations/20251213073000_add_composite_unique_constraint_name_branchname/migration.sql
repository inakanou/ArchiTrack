-- Migration: Add Composite Unique Constraint (name + branchName + deletedAt)
-- Requirements: 2.11, 4.8
--
-- This migration replaces the existing unique constraint on (name, deletedAt)
-- with a new composite unique constraint on (name, branchName, deletedAt).
-- This allows the same company name to exist with different branch names.
-- For example:
--   - "ABC Corporation" + "Tokyo Branch" + null (valid)
--   - "ABC Corporation" + "Osaka Branch" + null (valid)
--   - "ABC Corporation" + "Tokyo Branch" + null (duplicate, will fail)

-- Drop the existing unique constraint on (name, deletedAt)
DROP INDEX IF EXISTS "trading_partners_name_deletedAt_key";

-- Create the new composite unique constraint on (name, branchName, deletedAt)
CREATE UNIQUE INDEX "name_branchName_deletedAt" ON "trading_partners"("name", "branchName", "deletedAt");

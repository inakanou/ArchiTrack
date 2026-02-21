-- Task 60: Move net_amount from received_quotation_line_items to received_quotations
-- Requirements: 28.4 (NET金額は受領見積書1件につき1フィールド), 28.10 (NET金額のDB永続化)

-- Step 1: Add net_amount column to received_quotations table
ALTER TABLE "received_quotations" ADD COLUMN "net_amount" DECIMAL(15,2);

-- Step 2: Remove net_amount column from received_quotation_line_items table
-- Note: Existing line item net_amount data is discarded (NULLABLE, optional field with minimal impact)
ALTER TABLE "received_quotation_line_items" DROP COLUMN "net_amount";

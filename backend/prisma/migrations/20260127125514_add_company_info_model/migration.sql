-- CreateTable
CREATE TABLE "company_info" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "representative" TEXT NOT NULL,
    "phone" TEXT,
    "fax" TEXT,
    "email" TEXT,
    "invoice_registration_number" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_info_pkey" PRIMARY KEY ("id")
);

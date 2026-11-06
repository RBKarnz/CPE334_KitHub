-- CreateEnum
CREATE TYPE "Role" AS ENUM ('BORROWER', 'CUSTODIAN');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('AVAILABLE', 'ON_LOAN', 'MAINTENANCE', 'RETIRED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'CHECKED_OUT', 'RETURNED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'RETURNED');

-- CreateEnum
CREATE TYPE "ReturnCondition" AS ENUM ('GOOD', 'DAMAGED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "HistoryEntity" AS ENUM ('REQUEST', 'UNIT', 'LOAN');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultMaxLoanDays" INTEGER NOT NULL,
    "defaultMaxQuantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_types" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "maxLoanDays" INTEGER NOT NULL,
    "maxQuantityPerRequest" INTEGER NOT NULL,
    "isKit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "item_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" SERIAL NOT NULL,
    "itemTypeId" INTEGER NOT NULL,
    "assetTag" TEXT NOT NULL,
    "status" "UnitStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borrow_requests" (
    "id" SERIAL NOT NULL,
    "borrowerId" INTEGER NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "borrow_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_lines" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "itemTypeId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "request_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" SERIAL NOT NULL,
    "requestLineId" INTEGER NOT NULL,
    "unitId" INTEGER NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "checkedOutAt" TIMESTAMPTZ(3) NOT NULL,
    "checkedOutById" INTEGER NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "history_entries" (
    "id" SERIAL NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "ActorType" NOT NULL,
    "actorUserId" INTEGER,
    "entityType" "HistoryEntity" NOT NULL,
    "requestId" INTEGER,
    "unitId" INTEGER,
    "loanId" INTEGER,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "details" JSONB,

    CONSTRAINT "history_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "item_types_name_key" ON "item_types"("name");

-- CreateIndex
CREATE INDEX "item_types_categoryId_idx" ON "item_types"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "units_assetTag_key" ON "units"("assetTag");

-- CreateIndex
CREATE INDEX "units_itemTypeId_status_idx" ON "units"("itemTypeId", "status");

-- CreateIndex
CREATE INDEX "borrow_requests_status_createdAt_idx" ON "borrow_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "borrow_requests_borrowerId_status_idx" ON "borrow_requests"("borrowerId", "status");

-- CreateIndex
CREATE INDEX "request_lines_itemTypeId_idx" ON "request_lines"("itemTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "request_lines_requestId_itemTypeId_key" ON "request_lines"("requestId", "itemTypeId");

-- CreateIndex
CREATE INDEX "loans_status_dueAt_idx" ON "loans"("status", "dueAt");

-- CreateIndex
CREATE INDEX "history_entries_requestId_occurredAt_idx" ON "history_entries"("requestId", "occurredAt");

-- CreateIndex
CREATE INDEX "history_entries_unitId_occurredAt_idx" ON "history_entries"("unitId", "occurredAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_types" ADD CONSTRAINT "item_types_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "item_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrow_requests" ADD CONSTRAINT "borrow_requests_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_lines" ADD CONSTRAINT "request_lines_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "borrow_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_lines" ADD CONSTRAINT "request_lines_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "item_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_requestLineId_fkey" FOREIGN KEY ("requestLineId") REFERENCES "request_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_checkedOutById_fkey" FOREIGN KEY ("checkedOutById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entries_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entries_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "borrow_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entries_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entries_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written SQL (SDS 4.3). Prisma's schema language cannot express these.
-- Do not let a later generated migration drop any of them (SDS 4.3).
-- ---------------------------------------------------------------------------

-- Limits and quantities are at least 1 (BR-07, D-08). Sprint 2 adds loanDays >= 1.
ALTER TABLE "categories" ADD CONSTRAINT "categories_defaultMaxLoanDays_check" CHECK ("defaultMaxLoanDays" >= 1);
ALTER TABLE "categories" ADD CONSTRAINT "categories_defaultMaxQuantity_check" CHECK ("defaultMaxQuantity" >= 1);
ALTER TABLE "item_types" ADD CONSTRAINT "item_types_maxLoanDays_check" CHECK ("maxLoanDays" >= 1);
ALTER TABLE "item_types" ADD CONSTRAINT "item_types_maxQuantityPerRequest_check" CHECK ("maxQuantityPerRequest" >= 1);
ALTER TABLE "request_lines" ADD CONSTRAINT "request_lines_quantity_check" CHECK ("quantity" >= 1);

-- One ACTIVE loan per unit (BR-03, NFR-05): backstop for concurrent checkouts.
CREATE UNIQUE INDEX loans_one_active_per_unit ON loans ("unitId") WHERE status = 'ACTIVE';

-- History actor: actorUserId is set exactly when actorType is USER (BR-16, DD-13).
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entries_actor_check" CHECK (
  ("actorType" = 'USER' AND "actorUserId" IS NOT NULL)
  OR ("actorType" = 'SYSTEM' AND "actorUserId" IS NULL)
);

-- History subject: the reference matching entityType is set (BR-16).
ALTER TABLE "history_entries" ADD CONSTRAINT "history_entries_subject_check" CHECK (
  ("entityType" = 'REQUEST' AND "requestId" IS NOT NULL)
  OR ("entityType" = 'UNIT' AND "unitId" IS NOT NULL)
  OR ("entityType" = 'LOAN' AND "loanId" IS NOT NULL)
);

-- History is append-only (BR-16, DD-07): every UPDATE and DELETE is rejected.
-- TRUNCATE (used only to reset test databases) does not fire row triggers (SDS 4.6).
CREATE FUNCTION history_entries_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'history_entries is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER history_entries_append_only
BEFORE UPDATE OR DELETE ON history_entries
FOR EACH ROW EXECUTE FUNCTION history_entries_append_only();

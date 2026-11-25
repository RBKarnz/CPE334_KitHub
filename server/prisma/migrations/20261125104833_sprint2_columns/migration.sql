-- Sprint 2 columns of SDS 4.2 and their CHECKs from SDS 4.3 (#73).
-- Additive only: every new column is nullable, so existing Sprint 1 rows stay valid
-- (no REJECTED request and no RETURNED loan exists before Sprint 2).

-- AlterTable
ALTER TABLE "borrow_requests" ADD COLUMN     "decidedAt" TIMESTAMPTZ(3),
ADD COLUMN     "decidedById" INTEGER,
ADD COLUMN     "loanDays" INTEGER,
ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "loans" ADD COLUMN     "returnCondition" "ReturnCondition",
ADD COLUMN     "returnedAt" TIMESTAMPTZ(3),
ADD COLUMN     "returnedById" INTEGER;

-- AddForeignKey
ALTER TABLE "borrow_requests" ADD CONSTRAINT "borrow_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written CHECKs (Prisma cannot express them), SDS 4.3.
-- A request's loan length is at least 1 day when set (BR-08).
ALTER TABLE "borrow_requests" ADD CONSTRAINT "borrow_requests_loanDays_check" CHECK ("loanDays" IS NULL OR "loanDays" >= 1);
-- A rejected request carries a non-blank reason that its Borrower can see (BR-09).
ALTER TABLE "borrow_requests" ADD CONSTRAINT "borrow_requests_rejectionReason_check" CHECK (
  status <> 'REJECTED' OR ("rejectionReason" IS NOT NULL AND btrim("rejectionReason") <> '')
);
-- returnedAt is set exactly when the loan is RETURNED (SRS 8.3).
ALTER TABLE "loans" ADD CONSTRAINT "loans_returned_check" CHECK (("status" = 'RETURNED') = ("returnedAt" IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS "FinanceLedger_studentId_sectionId_active_key"
ON "FinanceLedger"("studentId", "sectionId")
WHERE "sectionId" IS NOT NULL
  AND "status" IN ('PENDING', 'POSTED');

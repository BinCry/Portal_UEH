import "dotenv/config";
import { auditRegistrationIntegrity } from "../src/domain/services/registration-integrity.service";
import { prisma } from "../src/lib/prisma";

const run = async () => {
  const report = await auditRegistrationIntegrity();
  const output = JSON.stringify(report, null, 2);

  if (!report.clean) {
    console.error(output);
    process.exitCode = 1;
    return;
  }

  console.log(output);
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

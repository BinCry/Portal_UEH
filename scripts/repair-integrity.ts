import "dotenv/config";
import { auditRegistrationIntegrity, repairRegistrationIntegrity } from "../src/domain/services/registration-integrity.service";
import { prisma } from "../src/lib/prisma";

const run = async () => {
  const shouldApply = process.argv.includes("--apply");

  if (!shouldApply) {
    const report = await auditRegistrationIntegrity();
    const output = JSON.stringify({ apply: false, report }, null, 2);
    if (!report.clean) {
      console.error(output);
      process.exitCode = 1;
      return;
    }

    console.log(output);
    return;
  }

  const report = await repairRegistrationIntegrity();
  const output = JSON.stringify({ apply: true, report }, null, 2);
  if (!report.after.clean) {
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

/**
 * DEV ONLY seed script.
 *
 * Gated behind SEED_DEV=true. Never run against production, and never
 * seed production data automatically. Every record created here is
 * explicitly fake-named ("Demo Company (dev only)") so demo data can
 * never be mistaken for real pipeline data.
 *
 * Run: SEED_DEV=true DATABASE_URL=... npx tsx scripts/seed.ts
 * (DATABASE_URL is normally picked up from a local .env file.)
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  if (process.env.SEED_DEV !== "true") {
    console.error("Refusing to seed: set SEED_DEV=true for local dev only.");
    process.exit(1);
  }

  // find-or-create (not upsert): the @@unique([name, website]) constraint
  // cannot be used for upsert when website is null.
  const existingCompany = await prisma.company.findFirst({
    where: { name: "Demo Company (dev only)" },
  });
  const company =
    existingCompany ??
    (await prisma.company.create({
      data: {
        name: "Demo Company (dev only)",
        industry: "Demo industry",
        country: "Demo country",
        city: "Demo city",
        status: "NEW",
        priority: "MEDIUM",
        description: "Fake demo record for local development only.",
      },
    }));

  const contact = await prisma.contact.upsert({
    where: {
      companyId_email: { companyId: company.id, email: "demo@example.invalid" },
    },
    update: {},
    create: {
      companyId: company.id,
      fullName: "Demo Contact (dev only)",
      jobTitle: "Demo role",
      email: "demo@example.invalid",
      isDecisionMaker: true,
    },
  });

  await prisma.followUp.upsert({
    where: { id: "dev-only-followup" },
    update: {},
    create: {
      id: "dev-only-followup",
      companyId: company.id,
      contactId: contact.id,
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      reason: "Demo follow-up (dev only)",
      status: "PENDING",
    },
  });

  console.log("Dev seed done:", {
    company: company.name,
    contact: contact.fullName,
  });
}

main()
  .catch((error: unknown) => {
    console.error("Dev seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  const passwordHash = await argon2.hash("ChangeMe123!");
  const user = await prisma.user.upsert({
    where: { email: "orbit-smoke@skyarc.in" },
    create: {
      email: "orbit-smoke@skyarc.in",
      passwordHash,
      name: "Orbit Smoke",
      role: "SUPERADMIN",
    },
    update: { passwordHash, deactivatedAt: null, role: "SUPERADMIN" },
  });
  console.log(user.email, user.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

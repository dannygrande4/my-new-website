import { config } from "dotenv";
config({ path: ".env.local" });

import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const { PrismaClient } = await import("../src/generated/prisma/client.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const games = ["Beer Pong", "Beer Die", "Baseball", "Honeycomb"];

  for (const name of games) {
    await prisma.game.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log("Seeded games:", games.join(", "));
  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

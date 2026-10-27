// Applies the versioned migrations in ./drizzle to DATABASE_URL (a libSQL file, or Turso with DATABASE_AUTH_TOKEN).
// `npm run db:push` stays for local development; production uses this.
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "./index";

migrate(db, { migrationsFolder: "drizzle" })
  .then(() => console.log("Migrations applied"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

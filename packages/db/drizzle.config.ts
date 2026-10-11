import { defineConfig } from "drizzle-kit";
import { ownerConnection } from "./src/connection";
import { DEV_DATABASE_URL } from "./src/dev-urls";

const connection = ownerConnection(DEV_DATABASE_URL);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials:
    typeof connection === "string"
      ? { url: connection }
      : {
          host: connection.host,
          port: connection.port,
          user: connection.user,
          password: connection.password,
          database: connection.database,
        },
  casing: "snake_case",
});

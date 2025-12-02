import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// DATABASE_URL is required at runtime but not for `prisma generate`
// Provide a dummy fallback for CI environments where only generation is needed
const databaseUrl =
  process.env.DATABASE_URL || 'postgresql://dummy:dummy@localhost:5432/dummy';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: databaseUrl,
  },
});

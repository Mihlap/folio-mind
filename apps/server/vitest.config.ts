import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';

if (!process.env.CI && !process.env.GITHUB_ACTIONS) {
  loadDotenv({ path: '.env' });
}

export default defineConfig({
  test: {
    environment: 'node',
    server: {
      deps: {
        inline: [/@folio-mind\/observability/, /@opentelemetry\//],
      },
    },
  },
});

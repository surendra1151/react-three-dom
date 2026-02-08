import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    specPattern: 'e2e/cypress/**/*.cy.ts',
    supportFile: 'e2e/cypress/support/e2e.ts',
    video: false,
    screenshotOnRunFailure: false,
    defaultCommandTimeout: 10_000,
  },
});

import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    use: {
        baseURL,
        browserName: 'chromium',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'npm run dev -- --port 4173 --strictPort',
        url: baseURL,
        reuseExistingServer: false,
        env: { GITHUB_REPOSITORY: '' },
    },
});

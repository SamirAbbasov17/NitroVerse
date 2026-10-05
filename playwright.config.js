import { defineConfig } from '@playwright/test';

// Testlər DEV serverə qarşı işləyir (window.__menu / __active qarmaqları yalnız DEV-dədir).
// Real GPU üçün sistem Chrome-u işlədilir — headless-shell SwiftShader ilə render edir
// və performans rəqəmləri mənasız olur.
export default defineConfig({
  testDir: './tests',
  outputDir: './tests/out/results',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1, // GPU tək; paralel işləsə kadr vaxtları korlanır
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: [
        '--use-angle=metal',
        '--enable-gpu',
        '--ignore-gpu-blocklist',
        '--autoplay-policy=no-user-gesture-required',
        '--mute-audio',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
      ],
    },
  },
  webServer: {
    command: 'npx vite --port 5173 --strictPort --no-open',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

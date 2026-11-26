import { defineConfig, devices } from "@playwright/test";

const host = "127.0.0.1";
const port = Number(process.env.E2E_PORT ?? 3100);
// Next.js normalizes loopback addresses to localhost in redirects. Start there so
// the host-only demo cookie is sent on the redirect to the workspace.
const baseURL = `http://localhost:${port}`;
const replicaPort = port + 1;
const demoReplicaURL = `http://localhost:${replicaPort}`;
const ci = Boolean(process.env.CI);

const env = {
  // Override local .env values at both build and start, including public build-time variables.
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-unused-publishable-key",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  // Test-only signer for the demo cookies; the database endpoint is unreachable.
  SUPABASE_SECRET_KEY: "e2e-demo-cookie-signing-key",
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: "",
  NEXT_PUBLIC_GTM_ID: "",
  AI_GATEWAY_API_KEY: "",
  GEMINI_API_KEY: "",
  GROQ_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  ELEVENLABS_API_KEY: "",
  DEMO_MAX_VISITORS: "100",
  INTERVIEW_CUSTOM_QUESTION_MAX_CHARS: "300",
  INTERVIEW_FULL_MAX_TOPICS: "2",
  INTERVIEW_FULL_TOPIC_FOLLOW_UPS: "1",
  INTERVIEW_FULL_TOTAL_FOLLOW_UPS: "1",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2,
  forbidOnly: ci,
  metadata: { demoReplicaURL },
  reporter: ci ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    locale: "en-US",
    timezoneId: "UTC",
    contextOptions: { reducedMotion: "reduce" },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: `npm run build && npm run start -- --hostname ${host} --port ${port}`,
      url: `${baseURL}/demo`,
      reuseExistingServer: false,
      timeout: 180_000,
      env,
    },
    {
      command: `npm run start -- --hostname ${host} --port ${replicaPort}`,
      url: `${demoReplicaURL}/demo`,
      reuseExistingServer: false,
      env,
    },
  ],
});

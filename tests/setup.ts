// Test-only environment. MONGODB_URI is set by tests/global-setup.ts.
process.env.JWT_SECRET ??= "test-secret-that-is-at-least-32-characters-long";
process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.APP_URL ??= "http://localhost:3000";

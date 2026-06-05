import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env.local") });

async function seedViaHTTP() {
  const BASE = process.env.BETTER_AUTH_URL || "http://localhost:3000";

  // User 1
  console.log("Creating user 1...");
  const signUpRes = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({
      name: "Sri (Dev)",
      email: "sri@visibleau.local",
      password: "password123",
    }),
  });
  const signUpData = await signUpRes.json();
  if (signUpRes.ok) {
    console.log("User 1 created:", signUpData.user?.id ?? signUpData.id);
  } else {
    console.log("User 1 may already exist:", signUpData.message ?? signUpRes.status);
  }

  // Sign in user 1
  console.log("Signing in user 1...");
  const signInRes = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({
      email: "sri@visibleau.local",
      password: "password123",
    }),
  });

  if (!signInRes.ok) {
    console.error("Sign-in failed:", signInRes.status, await signInRes.text());
    return;
  }

  // Extract session cookie from Set-Cookie header
  const cookies = signInRes.headers.getSetCookie?.() ?? [];
  const sessionCookie = cookies.find((c) => c.includes("better-auth"));
  if (!sessionCookie) {
    console.error("No session cookie returned. Cookies:", cookies);
    return;
  }
  const cookieValue = sessionCookie.split(";")[0];
  console.log("User 1 signed in, cookie obtained");

  // Create org for user 1
  console.log("Creating org 1...");
  const orgRes = await fetch(`${BASE}/api/auth/organization/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieValue,
      Origin: BASE,
    },
    body: JSON.stringify({
      name: "VisibleAU Dev",
      slug: "visibleau-dev",
    }),
  });
  const orgText = await orgRes.text();
  const orgData = orgText ? JSON.parse(orgText) : {};
  console.log(
    "Org 1:",
    orgRes.ok ? `created (${orgData.id ?? "ok"})` : (orgData.message ?? orgRes.status),
  );

  // Sync user 1
  await fetch(`${BASE}/api/auth/sync-user`, {
    method: "POST",
    headers: { Cookie: cookieValue, Origin: BASE },
  });
  console.log("User 1 synced to app users table");

  // User 2
  console.log("\nCreating user 2...");
  const signUp2 = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({
      name: "Test User 2",
      email: "user2@visibleau.local",
      password: "password123",
    }),
  });
  if (signUp2.ok) {
    console.log("User 2 created");
  } else {
    console.log("User 2 may already exist");
  }

  const signIn2 = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({
      email: "user2@visibleau.local",
      password: "password123",
    }),
  });
  const cookies2 = signIn2.headers.getSetCookie?.() ?? [];
  const cookie2 = cookies2.find((c) => c.includes("better-auth"))?.split(";")[0];
  if (!cookie2) {
    console.log("User 2 sign-in failed");
    return;
  }

  const org2 = await fetch(`${BASE}/api/auth/organization/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie2, Origin: BASE },
    body: JSON.stringify({ name: "Test Agency 2", slug: "test-agency-2" }),
  });
  const org2Text = await org2.text();
  const org2Data = org2Text ? JSON.parse(org2Text) : {};
  console.log(
    "Org 2:",
    org2.ok ? `created (${org2Data.id ?? "ok"})` : (org2Data.message ?? org2.status),
  );

  await fetch(`${BASE}/api/auth/sync-user`, {
    method: "POST",
    headers: { Cookie: cookie2, Origin: BASE },
  });
  console.log("User 2 synced");

  console.log("\n✅ Seed complete. Sign in at http://localhost:3000/sign-in");
  console.log("   User 1: sri@visibleau.local / password123");
  console.log("   User 2: user2@visibleau.local / password123");
}

seedViaHTTP().catch(console.error);

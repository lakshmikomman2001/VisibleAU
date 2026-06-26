/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://visibleau.com",
  generateRobotsTxt: true,
  robotsTxtOptions: {
    policies: [
      { userAgent: "*", allow: "/" },
      {
        userAgent: "*",
        disallow: [
          "/api/",
          "/dashboard",
          "/settings",
          "/brands",
          "/audit",
          "/agency",
          "/onboarding",
          "/welcome",
        ],
      },
    ],
  },
  exclude: [
    "/api/*",
    "/dashboard/*",
    "/settings/*",
    "/brands/*",
    "/audit/*",
    "/agency/*",
    "/onboarding",
    "/welcome",
  ],
};

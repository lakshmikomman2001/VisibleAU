import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  integrations: [
    Sentry.httpIntegration(),
    Sentry.nativeNodeFetchIntegration(),
  ],
  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
      delete event.user.username;
    }
    if (event.request?.url) {
      event.request.url = event.request.url.replace(
        /domain=[^&]+/,
        "domain=[REDACTED]",
      );
    }
    if (event.extra) {
      delete event.extra.brandName;
      delete event.extra.domain;
      delete event.extra.organizationId;
    }
    return event;
  },
});

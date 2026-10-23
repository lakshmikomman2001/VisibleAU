import nodemailer from "nodemailer";

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "localhost",
  port: parseInt(process.env.SMTP_PORT || "1025", 10),
  secure: false,
});

export const resend = {
  emails: {
    send: async (params: {
      from: string;
      to: string;
      subject: string;
      html?: string;
      text?: string;
    }) => {
      console.log(`\n[EMAIL] To: ${params.to} | Subject: ${params.subject}`);
      try {
        await transport.sendMail({
          from: params.from,
          to: params.to,
          subject: params.subject,
          html: params.html,
          text: params.text,
        });
      } catch (err) {
        // "Fix the Data Residency compute line, and check whether
        // production emails are actually sent" (23 Oct) -- this used
        // to be console.log, so a genuinely undelivered email (e.g.
        // SMTP_HOST pointing nowhere in production) looked identical
        // in logs to routine info output, and the real cause (err)
        // was discarded entirely. The return value below is
        // unchanged -- still a fake success id, never throws -- this
        // only makes the failure visible at the right severity.
        console.error(
          "[EMAIL] SMTP send failed — email NOT sent:",
          err instanceof Error ? err.message : err,
        );
      }
      return { id: `local-${Date.now()}` };
    },
  },
};

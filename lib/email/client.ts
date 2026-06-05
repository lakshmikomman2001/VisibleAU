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
      } catch {
        console.log("[EMAIL] SMTP not available — email logged only");
      }
      return { id: `local-${Date.now()}` };
    },
  },
};

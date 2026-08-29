import nodemailer, { type Transporter } from "nodemailer";
import { constants } from "node:fs";
import { open } from "node:fs/promises";

export interface MailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailDelivery {
  deliver(message: MailMessage): Promise<void>;
  close?(): Promise<void>;
}

export interface SmtpMailConfiguration {
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  username?: string;
  password?: string;
}

export interface MemoryMailSink extends MailDelivery {
  messages(): readonly MailMessage[];
  clear(): void;
}

/**
 * Cross-process sink for browser tests. The caller must use a private temporary
 * path and remove it after the run; live configuration rejects this adapter.
 */
export function createFileMailSink(filePath: string): MailDelivery {
  return {
    async deliver(message) {
      const handle = await open(
        filePath,
        constants.O_APPEND |
          constants.O_CREAT |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      );
      try {
        await handle.chmod(0o600);
        await handle.appendFile(
          `${JSON.stringify({ deliveredAt: new Date().toISOString(), message })}\n`,
          "utf8",
        );
      } finally {
        await handle.close();
      }
    },
  };
}

export function createSmtpMailDelivery(
  configuration: SmtpMailConfiguration,
): MailDelivery {
  const transporter: Transporter = nodemailer.createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.secure,
    requireTLS: configuration.requireTls,
    ...(configuration.username && configuration.password
      ? {
          auth: {
            user: configuration.username,
            pass: configuration.password,
          },
        }
      : {}),
  });

  return {
    async deliver(message) {
      await transporter.sendMail(message);
    },
    async close() {
      transporter.close();
    },
  };
}

export function createMemoryMailSink(): MemoryMailSink {
  const delivered: MailMessage[] = [];
  return {
    async deliver(message) {
      delivered.push({ ...message });
    },
    messages() {
      return delivered.map((message) => ({ ...message }));
    },
    clear() {
      delivered.length = 0;
    },
  };
}

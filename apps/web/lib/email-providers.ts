export type EmailProviderKey =
  "gmail" | "microsoft" | "yahoo" | "icloud" | "zoho" | "custom";

export type EmailConnectionMode =
  "api-oauth" | "imap-oauth" | "imap-app-password";

export interface EmailProviderDefinition {
  key: EmailProviderKey;
  name: string;
  shortName: string;
  description: string;
  connectionMode: EmailConnectionMode;
  tone: string;
  mark: string;
  incoming?: { host: string; port: number; security: "tls" };
  outgoing?: {
    host: string;
    port: number;
    security: "tls" | "starttls";
  };
  permissions: string[];
  guidance?: string;
}

export const emailProviderDefinitions: EmailProviderDefinition[] = [
  {
    key: "gmail",
    name: "Gmail / Google Workspace",
    shortName: "Gmail",
    description: "Google sign-in with Gmail API sync and push updates.",
    connectionMode: "api-oauth",
    tone: "google",
    mark: "G",
    permissions: [
      "Read and organize mail",
      "Send mail from this address",
      "Keep the inbox synced while you are away",
    ],
  },
  {
    key: "microsoft",
    name: "Outlook / Microsoft 365",
    shortName: "Outlook",
    description: "Microsoft sign-in for Outlook, Hotmail, and work accounts.",
    connectionMode: "api-oauth",
    tone: "microsoft",
    mark: "M",
    permissions: [
      "Read and organize mail through Microsoft Graph",
      "Send mail from this address",
      "Keep the inbox synced while you are away",
    ],
  },
  {
    key: "yahoo",
    name: "Yahoo Mail / AOL",
    shortName: "Yahoo",
    description: "Secure Yahoo sign-in, normalized through IMAP and SMTP.",
    connectionMode: "imap-oauth",
    tone: "yahoo",
    mark: "Y!",
    incoming: { host: "imap.mail.yahoo.com", port: 993, security: "tls" },
    outgoing: { host: "smtp.mail.yahoo.com", port: 465, security: "tls" },
    permissions: [
      "Read and organize mail",
      "Send mail from this address",
      "Refresh access without storing your Yahoo password",
    ],
    guidance:
      "AOL accounts use imap.aol.com and smtp.aol.com. TREVV selects those automatically from the address.",
  },
  {
    key: "icloud",
    name: "Apple iCloud Mail",
    shortName: "iCloud",
    description: "Connect with Apple’s IMAP/SMTP servers and an app password.",
    connectionMode: "imap-app-password",
    tone: "icloud",
    mark: "",
    incoming: { host: "imap.mail.me.com", port: 993, security: "tls" },
    outgoing: {
      host: "smtp.mail.me.com",
      port: 587,
      security: "starttls",
    },
    permissions: [
      "Read and organize iCloud Mail",
      "Send mail from this address",
      "Use a revocable Apple app-specific password",
    ],
    guidance:
      "Do not enter your main Apple Account password. Generate an app-specific password at account.apple.com after enabling two-factor authentication.",
  },
  {
    key: "zoho",
    name: "Zoho Mail",
    shortName: "Zoho",
    description: "Connect Zoho-hosted personal or custom-domain mail.",
    connectionMode: "imap-app-password",
    tone: "zoho",
    mark: "Z",
    incoming: { host: "imap.zoho.com", port: 993, security: "tls" },
    outgoing: { host: "smtp.zoho.com", port: 465, security: "tls" },
    permissions: [
      "Read and organize Zoho Mail",
      "Send mail from this address",
      "Use an app-specific password when two-factor authentication is on",
    ],
    guidance:
      "Zoho server names can vary by plan and data region. Confirm the values shown in Zoho Mail settings before connecting.",
  },
  {
    key: "custom",
    name: "Custom domain email",
    shortName: "Custom",
    description: "Use the secure IMAP and SMTP settings from your mail host.",
    connectionMode: "imap-app-password",
    tone: "custom",
    mark: "@",
    permissions: [
      "Read and organize mail over encrypted IMAP",
      "Send mail over authenticated SMTP",
      "Keep credentials encrypted on the server",
    ],
    guidance:
      "Use a provider-issued app password when available. TREVV never needs the password you use to sign into webmail.",
  },
];

export function emailProvider(key: EmailProviderKey) {
  return emailProviderDefinitions.find((provider) => provider.key === key)!;
}

export function yahooHosts(address: string) {
  const isAol = /@aol\./i.test(address);
  return isAol
    ? { incoming: "imap.aol.com", outgoing: "smtp.aol.com" }
    : { incoming: "imap.mail.yahoo.com", outgoing: "smtp.mail.yahoo.com" };
}

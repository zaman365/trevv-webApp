import { describe, expect, it } from "vitest";
import {
  emailProvider,
  emailProviderDefinitions,
  yahooHosts,
} from "./email-providers";

describe("email provider configuration", () => {
  it("keeps every provider key unique", () => {
    const keys = emailProviderDefinitions.map((provider) => provider.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses provider APIs for Google and Microsoft", () => {
    expect(emailProvider("gmail").connectionMode).toBe("api-oauth");
    expect(emailProvider("microsoft").connectionMode).toBe("api-oauth");
  });

  it("uses Apple's published secure mail settings", () => {
    const icloud = emailProvider("icloud");
    expect(icloud.incoming).toEqual({
      host: "imap.mail.me.com",
      port: 993,
      security: "tls",
    });
    expect(icloud.outgoing).toEqual({
      host: "smtp.mail.me.com",
      port: 587,
      security: "starttls",
    });
  });

  it("selects the correct Yahoo or AOL hosts from the address", () => {
    expect(yahooHosts("owner@yahoo.com")).toEqual({
      incoming: "imap.mail.yahoo.com",
      outgoing: "smtp.mail.yahoo.com",
    });
    expect(yahooHosts("owner@aol.com")).toEqual({
      incoming: "imap.aol.com",
      outgoing: "smtp.aol.com",
    });
  });

  it("requires app-password mode for manual IMAP providers", () => {
    for (const key of ["icloud", "zoho", "custom"] as const) {
      expect(emailProvider(key).connectionMode).toBe("imap-app-password");
    }
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  passwordResetDeliveryMessage,
  verificationResendMessage,
  VerifyEmailExperience,
} from "./account-recovery";
import { AuthExperience } from "./auth-experience";

describe("registration admission experience", () => {
  it("explains closed private-beta access without rendering a sign-up form", () => {
    const html = renderToStaticMarkup(
      createElement(AuthExperience, {
        demoEnabled: false,
        mode: "sign-up",
        registrationMode: "closed",
        returnTo: "/onboarding",
      }),
    );

    expect(html).toContain("Private beta access");
    expect(html).toContain(
      "Self-service account registration is not open yet.",
    );
    expect(html).toContain("Already have an account?");
    expect(html).not.toContain("<form");
    expect(html).not.toContain('name="email"');
    expect(html).not.toContain("invitation-only");
  });

  it("renders the form only for explicitly public non-production registration", () => {
    const html = renderToStaticMarkup(
      createElement(AuthExperience, {
        demoEnabled: false,
        mode: "sign-up",
        registrationMode: "public",
        returnTo: "/onboarding",
      }),
    );

    expect(html).toContain("Create your account");
    expect(html).toContain("<form");
    expect(html).toContain('name="email"');
  });

  it("renders an honestly labeled form for server-validated invitation admission", () => {
    const html = renderToStaticMarkup(
      createElement(AuthExperience, {
        demoEnabled: false,
        mode: "sign-up",
        registrationMode: "invite_only",
        returnTo: "/invite/accept?resume=1",
      }),
    );

    expect(html).toContain("Create your invited account");
    expect(html).toContain("valid TREVV invitation");
    expect(html).toContain("checked securely");
    expect(html).toContain("<form");
  });

  it("offers verification resend without claiming failed delivery succeeded", () => {
    const html = renderToStaticMarkup(
      createElement(VerifyEmailExperience, {
        deliveryFailed: true,
        email: "invited@example.test",
        resume: false,
        returnTo: "/invite/accept?resume=1",
      }),
    );

    expect(html).toContain(
      "verification email could not be delivered. Request another link below.",
    );
    expect(html).toContain("Resend verification email");
    expect(html).not.toContain("Open the time-limited verification link sent");
  });

  it("does not claim a rate-limited verification resend was accepted", () => {
    const message = verificationResendMessage({ ok: false, status: 429 });

    expect(message).toBe(
      "Too many verification requests. Wait a moment and try again.",
    );
    expect(message).not.toContain("send another link");
  });

  it("keeps successful recovery responses non-assertive about external mail", () => {
    const verification = verificationResendMessage({ ok: true, status: 200 });

    expect(verification).toContain("delivery succeeds");
    expect(verification).toContain("may arrive");
    expect(verification).not.toContain("will send");
    expect(passwordResetDeliveryMessage).toContain("delivery succeeds");
    expect(passwordResetDeliveryMessage).toContain("may arrive");
    expect(passwordResetDeliveryMessage).not.toContain("TREVV sent");
  });
});

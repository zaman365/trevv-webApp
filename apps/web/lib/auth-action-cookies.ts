export const authActionCookies = {
  invitation: "trevv.pending_invitation",
  invitationRegistration: "trevv.registration_invitation",
  passwordReset: "trevv.pending_password_reset",
  emailVerification: "trevv.pending_email_verification",
} as const;

export const authActionCookiePaths = {
  invitation: "/api/web/invitations/accept",
  invitationRegistration: "/api/auth/sign-up/email",
  passwordReset: "/api/web/reset-password",
  emailVerification: "/api/web/verify-email",
} as const;

export function authActionCookieOptions(path: string, secure: boolean) {
  return {
    httpOnly: true,
    maxAge: 60 * 60,
    path,
    sameSite: "lax" as const,
    secure,
  };
}

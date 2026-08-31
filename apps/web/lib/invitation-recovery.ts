export function invitationAcceptanceUpstream(token: string | undefined): {
  path: "/invitations/accept" | "/invitations/accept-claim";
  init: RequestInit;
} {
  return token
    ? {
        path: "/invitations/accept",
        init: { method: "POST", body: JSON.stringify({ token }) },
      }
    : {
        path: "/invitations/accept-claim",
        init: { method: "POST" },
      };
}

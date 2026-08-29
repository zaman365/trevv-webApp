export function appendSetCookieHeaders(source: Headers, target: Headers): void {
  const sourceWithCookies = source as Headers & {
    getSetCookie?: () => string[];
  };
  const cookies = sourceWithCookies.getSetCookie?.() ?? [];
  if (cookies.length) {
    for (const cookie of cookies) target.append("set-cookie", cookie);
    return;
  }
  const combined = source.get("set-cookie");
  if (combined) target.append("set-cookie", combined);
}

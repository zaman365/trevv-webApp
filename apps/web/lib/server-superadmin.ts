import "server-only";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { superadminSessionSchema } from "@founderhq/api-contract";
import { webApiOrigin, webRuntimeMode } from "./web-runtime-config";

export async function requireSuperadminSession(enrollment = false) {
  if (webRuntimeMode() !== "live") notFound();
  const cookie = (await cookies())
    .getAll()
    .filter((item) => /^(?:__Secure-)?trevv_superadmin\./u.test(item.name))
    .map((item) => `${item.name}=${item.value}`)
    .join("; ");
  if (!cookie) redirect("/superadmin/sign-in");
  const response = await fetch(
    new URL("/api/superadmin/session", webApiOrigin()),
    { headers: { cookie }, cache: "no-store" },
  );
  if (response.status === 401) redirect("/superadmin/sign-in");
  if (response.status === 404) notFound();
  if (!response.ok)
    throw new Error("Administrator access is temporarily unavailable.");
  const session = superadminSessionSchema.parse(await response.json());
  if (!enrollment && (!session.twoFactorEnabled || !session.assuranceAt))
    redirect("/superadmin/security");
  return session;
}

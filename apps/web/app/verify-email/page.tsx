import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VerifyEmailExperience } from "@/components/account-recovery";
import { safeReturnPath, webRuntimeMode } from "@/lib/web-runtime-config";

export const metadata: Metadata = {
  title: "Verify email",
  robots: { index: false },
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{
    delivery?: string;
    email?: string;
    next?: string;
    resume?: string;
  }>;
}) {
  if (webRuntimeMode() === "demo") redirect("/sign-in");
  const { delivery, email, next, resume } = await searchParams;
  return (
    <VerifyEmailExperience
      deliveryFailed={delivery === "failed"}
      resume={resume === "1"}
      returnTo={safeReturnPath(next ?? "/onboarding")}
      {...(email ? { email } : {})}
    />
  );
}

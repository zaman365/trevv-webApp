import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetPasswordExperience } from "@/components/account-recovery";
import { webRuntimeMode } from "@/lib/web-runtime-config";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; resume?: string }>;
}) {
  if (webRuntimeMode() === "demo") redirect("/sign-in");
  const { error, resume } = await searchParams;
  return (
    <ResetPasswordExperience invalid={Boolean(error)} resume={resume === "1"} />
  );
}

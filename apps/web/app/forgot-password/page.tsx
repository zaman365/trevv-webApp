import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ForgotPasswordExperience } from "@/components/account-recovery";
import { webRuntimeMode } from "@/lib/web-runtime-config";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  if (webRuntimeMode() === "demo") redirect("/sign-in");
  return <ForgotPasswordExperience />;
}

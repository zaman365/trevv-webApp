import { OnboardingExperience } from "@/components/auth-experience";
import { requireOnboardingAccess } from "@/lib/server-auth";
import { webRuntimeMode } from "@/lib/web-runtime-config";

export default async function OnboardingPage() {
  const live = webRuntimeMode() === "live";
  if (live) await requireOnboardingAccess();
  return <OnboardingExperience live={live} />;
}

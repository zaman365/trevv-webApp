import { AuthExperience } from "@/components/auth-experience";
import {
  safeReturnPath,
  webRegistrationMode,
  webRuntimeMode,
} from "@/lib/web-runtime-config";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <AuthExperience
      demoEnabled={webRuntimeMode() === "demo"}
      mode="sign-up"
      registrationMode={webRegistrationMode()}
      returnTo={safeReturnPath(next ?? "/onboarding")}
    />
  );
}

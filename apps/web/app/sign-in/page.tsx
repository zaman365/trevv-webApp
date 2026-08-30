import { AuthExperience } from "@/components/auth-experience";
import {
  safeReturnPath,
  webRegistrationMode,
  webRuntimeMode,
} from "@/lib/web-runtime-config";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    reset?: string;
    signedOut?: string;
    verified?: string;
  }>;
}) {
  const query = await searchParams;
  return (
    <AuthExperience
      demoEnabled={webRuntimeMode() === "demo"}
      mode="sign-in"
      passwordReset={query.reset === "1"}
      registrationMode={webRegistrationMode()}
      returnTo={safeReturnPath(query.next)}
      {...(query.signedOut ? { signedOut: query.signedOut } : {})}
      verified={query.verified === "1"}
    />
  );
}

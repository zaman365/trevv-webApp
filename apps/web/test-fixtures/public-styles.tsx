import { createRoot } from "react-dom/client";
import {
  AuthExperience,
  OnboardingExperience,
} from "@/components/auth-experience";
import {
  ForgotPasswordExperience,
  ResetPasswordExperience,
  VerifyEmailExperience,
} from "@/components/account-recovery";
import { OrganizationSelection } from "@/components/organization-selection";
import { InvitationAcceptance } from "@/components/invitation-acceptance";

const page = new URLSearchParams(window.location.search).get("page");
const content =
  page === "onboarding" ? (
    <OnboardingExperience live={false} />
  ) : page === "forgot" ? (
    <ForgotPasswordExperience />
  ) : page === "reset" ? (
    <ResetPasswordExperience invalid={false} resume={true} />
  ) : page === "verify" ? (
    <VerifyEmailExperience
      email="fixture@example.test"
      resume={false}
      returnTo="/app/portfolio"
    />
  ) : page === "organizations" ? (
    <OrganizationSelection returnTo="/app/portfolio" />
  ) : page === "invite" ? (
    <InvitationAcceptance resume={false} />
  ) : (
    <AuthExperience
      mode={page === "sign-up" ? "sign-up" : "sign-in"}
      demoEnabled
      registrationMode="public"
      returnTo="/app/portfolio"
    />
  );
createRoot(document.getElementById("root")!).render(content);

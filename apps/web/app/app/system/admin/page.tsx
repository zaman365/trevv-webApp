import { redirect } from "next/navigation";

// Compatibility for bookmarked links; Superadmin applies its own identity checks.
export default function PlatformAdminRedirect() {
  redirect("/superadmin");
}

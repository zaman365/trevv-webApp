import { requireAppSession } from "@/lib/server-auth";
import { TrevvGuide } from "@/components/trevv-guide";

export default async function GuidePage() {
  await requireAppSession("/app/guide");
  return <TrevvGuide />;
}

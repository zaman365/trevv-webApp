import Link from "next/link";
import { LiveStateNotice } from "@/components/live-state";

export default function NotFound() {
  return (
    <main className="route-state-shell">
      <LiveStateNotice
        kind="no-results"
        title="Page not found"
        description="The address does not match an available TREVV page."
        actions={<Link href="/">Return to TREVV</Link>}
      />
    </main>
  );
}

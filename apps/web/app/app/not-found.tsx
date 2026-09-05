import { AppLink as Link } from "@/components/navigation-link";
import { LiveStateNotice } from "@/components/live-state";

export default function AppNotFound() {
  return (
    <main className="route-state-shell">
      <LiveStateNotice
        kind="permission-loss"
        title="This page could not be found"
        description="It may not exist, or your access may have changed. TREVV does not reveal private resource details."
        actions={<Link href="/app/portfolio">Open Portfolio</Link>}
      />
    </main>
  );
}

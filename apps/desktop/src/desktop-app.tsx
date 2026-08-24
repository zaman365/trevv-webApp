import { createApiClient } from "@founderhq/api-client";
import { demoHubs } from "@founderhq/core";
import { useQuery } from "@tanstack/react-query";
import { Bell, Grid2X2, Plus, RefreshCw, Search } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:8787/api/v1",
});
const queryClient = new QueryClient();
export function DesktopApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <DesktopPortfolio />
    </QueryClientProvider>
  );
}
function DesktopPortfolio() {
  const portfolio = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.portfolio(),
    retry: 1,
  });
  const [query, setQuery] = useState("");
  const hubs =
    portfolio.data?.hubs ??
    demoHubs.map((hub) => ({
      hub,
      rollup: {
        open: 0,
        overdue: 0,
        blocked: 0,
        decisions: 0,
        approvals: 0,
        score: 0,
      },
    }));
  return (
    <div className="desktop-shell">
      <aside>
        <div className="desktop-brand">
          <span>T</span>
          <strong>TREVV</strong>
        </div>
        <button className="active">
          <Grid2X2 size={16} />
          Portfolio
        </button>
        <p>Hubs</p>
        {hubs.slice(0, 7).map(({ hub }) => (
          <button key={hub.id}>
            <i style={{ color: hub.accent, background: `${hub.accent}18` }}>
              {hub.icon}
            </i>
            {hub.name}
          </button>
        ))}
        <footer>
          <span>MZ</span>
          <div>
            <strong>Mohammed</strong>
            <small>Owner</small>
          </div>
        </footer>
      </aside>
      <main>
        <header>
          <label>
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search TREVV…"
            />
          </label>
          <button>
            <Plus size={14} />
            Quick capture
          </button>
          <button aria-label="Notifications">
            <Bell size={16} />
          </button>
        </header>
        <section>
          <div className="desktop-heading">
            <div>
              <p>DESKTOP FOUNDATION</p>
              <h1>Portfolio</h1>
              <span>
                One hosted API. The native capabilities come where they add
                value.
              </span>
            </div>
            <button onClick={() => void portfolio.refetch()}>
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
          {portfolio.isError && (
            <div className="desktop-offline">
              API unavailable — showing a safe local shell. Configure
              VITE_API_URL to load live Hubs.
            </div>
          )}
          <div className="desktop-grid">
            {hubs
              .filter(({ hub }) =>
                hub.name
                  .toLocaleLowerCase()
                  .includes(query.toLocaleLowerCase()),
              )
              .map(({ hub, rollup }) => (
                <article
                  key={hub.id}
                  style={{ "--accent": hub.accent } as React.CSSProperties}
                >
                  <header>
                    <span>{hub.icon}</span>
                    <div>
                      <h2>{hub.name}</h2>
                      <small>{hub.stage}</small>
                    </div>
                    <b className={`health-${hub.health}`}>
                      {hub.health.replace("_", " ")}
                    </b>
                  </header>
                  <p>{hub.priority}</p>
                  <div>
                    <span>
                      <strong>{rollup.open}</strong>open
                    </span>
                    <span>
                      <strong>{rollup.blocked}</strong>blocked
                    </span>
                    <span>
                      <strong>{rollup.decisions + rollup.approvals}</strong>
                      attention
                    </span>
                  </div>
                  <footer>
                    <span className="desktop-avatar">{hub.lead.initials}</span>
                    <small>{hub.nextMilestone.title}</small>
                    <b>→</b>
                  </footer>
                </article>
              ))}
          </div>
        </section>
      </main>
    </div>
  );
}

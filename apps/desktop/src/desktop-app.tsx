import { createApiClient } from "@founderhq/api-client";
import { demoWorkspaces } from "@founderhq/core";
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
  const workspaces =
    portfolio.data?.workspaces ??
    demoWorkspaces.map((workspace) => ({
      workspace,
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
        <p>Projects</p>
        {workspaces.slice(0, 7).map(({ workspace }) => (
          <button key={workspace.id}>
            <i
              style={{
                color: workspace.accent,
                background: `${workspace.accent}18`,
              }}
            >
              {workspace.icon}
            </i>
            {workspace.name}
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
              VITE_API_URL to load live Workspaces.
            </div>
          )}
          <div className="desktop-grid">
            {workspaces
              .filter(({ workspace }) =>
                workspace.name
                  .toLocaleLowerCase()
                  .includes(query.toLocaleLowerCase()),
              )
              .map(({ workspace, rollup }) => (
                <article
                  key={workspace.id}
                  style={
                    { "--accent": workspace.accent } as React.CSSProperties
                  }
                >
                  <header>
                    <span>{workspace.icon}</span>
                    <div>
                      <h2>{workspace.name}</h2>
                      <small>{workspace.stage}</small>
                    </div>
                    <b className={`health-${workspace.health}`}>
                      {workspace.health.replace("_", " ")}
                    </b>
                  </header>
                  <p>{workspace.priority}</p>
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
                    <span className="desktop-avatar">
                      {workspace.lead?.initials ?? "—"}
                    </span>
                    <small>
                      {workspace.nextMilestone?.title ??
                        "No milestone scheduled"}
                    </small>
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

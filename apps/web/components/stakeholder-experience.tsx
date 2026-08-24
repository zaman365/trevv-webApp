import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { demoHubs, demoItems, demoStakeholderExposure } from "@founderhq/core";
import { trevvBrand } from "@/lib/branding";

export function StakeholderExperience({ slug }: { slug: string }) {
  const hub = demoHubs.find((candidate) => candidate.slug === slug);
  if (!hub || hub.id !== demoStakeholderExposure.hubId)
    return (
      <main className="stakeholder-page stakeholder-unavailable">
        <ShieldCheck size={28} />
        <h1>This stakeholder view is not shared</h1>
        <p>Ask a Hub Lead or Admin to expose selected information.</p>
      </main>
    );
  const work = demoItems.filter((item) =>
    demoStakeholderExposure.selectedWorkItemIds.includes(item.id),
  );
  const approvals = demoItems.filter((item) =>
    demoStakeholderExposure.approvalItemIds.includes(item.id),
  );
  return (
    <main className="stakeholder-page">
      <header className="stakeholder-topbar">
        <div className="auth-brand">
          <span className="brand-mark">
            <span>T</span>
          </span>
          <strong>{trevvBrand.name}</strong>
        </div>
        <span>
          <ShieldCheck size={13} />
          Stakeholder view · selected information only
        </span>
      </header>
      <section
        className="stakeholder-hero"
        style={{ "--hub-accent": hub.accent } as React.CSSProperties}
      >
        <span
          className="hub-mark"
          style={{ background: `${hub.accent}18`, color: hub.accent }}
        >
          {hub.icon}
        </span>
        <div>
          <p>{hub.type.replaceAll("_", " ")}</p>
          <h1>{hub.name}</h1>
          <span>{hub.priority}</span>
        </div>
        {demoStakeholderExposure.health && (
          <b className={`health-badge ${hub.health}`}>
            <CheckCircle2 size={13} />
            {hub.health.replace("_", " ")}
          </b>
        )}
      </section>
      <div className="stakeholder-grid">
        {demoStakeholderExposure.latestUpdate && (
          <section className="stakeholder-card stakeholder-update">
            <header>
              <Clock3 size={16} />
              <h2>Latest Update</h2>
              <time>{hub.latestUpdate.date}</time>
            </header>
            <p>{hub.latestUpdate.text}</p>
            <small>Shared by the Hub Lead</small>
          </section>
        )}
        {demoStakeholderExposure.milestones && (
          <section className="stakeholder-card">
            <header>
              <CheckCircle2 size={16} />
              <h2>Next milestone</h2>
            </header>
            <strong>{hub.nextMilestone.title}</strong>
            <p>Target {hub.nextMilestone.date}</p>
          </section>
        )}
        <section className="stakeholder-card stakeholder-work">
          <header>
            <FileText size={16} />
            <h2>Selected work</h2>
          </header>
          {work.map((item) => (
            <article key={item.id}>
              <span className={`priority-dot ${item.priority}`} />
              <div>
                <strong>{item.title}</strong>
                <small>
                  {item.status.replace("_", " ")} · due {item.dueDate}
                </small>
              </div>
            </article>
          ))}
        </section>
        <section className="stakeholder-card stakeholder-approvals">
          <header>
            <ShieldCheck size={16} />
            <h2>Needs stakeholder</h2>
          </header>
          {approvals.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <small>Approval requested · due {item.dueDate}</small>
              </div>
              <button>
                Review <ArrowRight size={12} />
              </button>
            </article>
          ))}
        </section>
        <section className="stakeholder-card stakeholder-resource">
          <header>
            <ExternalLink size={16} />
            <h2>Approved resources</h2>
          </header>
          <a href="#resource">
            <FileText size={15} />
            <div>
              <strong>Delivery proof pack</strong>
              <small>Approved file · PDF</small>
            </div>
            <ExternalLink size={12} />
          </a>
        </section>
      </div>
      <footer className="stakeholder-footer">
        <ShieldCheck size={13} />
        Internal comments, private notes, and unselected work are not included
        in this view.
      </footer>
    </main>
  );
}

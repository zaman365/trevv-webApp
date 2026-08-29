"use client";

import {
  ArrowRight,
  BellRing,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  Link2,
  Mail,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { safeCsvCell } from "@founderhq/core";
import { WorkspaceFrame } from "./workspace-frame";
import { Hint } from "./learning-center";
import { CapabilityNotice } from "./capability-status";
import { useAppSession } from "@/lib/app-session-context";

type SettingsSection =
  "integrations" | "security" | "organization" | "members" | "audit" | "export";

type ProviderKey =
  "google-drive" | "figma" | "github" | "canva" | "google-calendar";

type ProviderStatus = "connected" | "enabled" | "off";
type AuditCategory =
  "Integration" | "Security" | "Organization" | "Member" | "Export";
type MemberRole =
  "Owner" | "Admin" | "Workspace lead" | "Member" | "Stakeholder";

interface ProviderDefinition {
  key: ProviderKey;
  name: string;
  category: string;
  description: string;
  icon: string;
  tone: string;
  mode: "deep" | "smart-link" | "future";
  permissions: string[];
}

interface ProviderConnection {
  status: ProviderStatus;
  label?: string;
  connectedAt?: string;
}

interface OrganizationSettings {
  name: string;
  slug: string;
  timezone: string;
  language: "English" | "Deutsch";
  weekStartsOn: "Monday" | "Sunday";
}

interface Member {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: MemberRole;
  status: "active" | "invited";
  lastActive: string;
  current?: boolean;
}

interface Session {
  id: string;
  device: string;
  detail: string;
  activeAt: string;
  kind: "desktop" | "mobile";
  current?: boolean;
}

interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  category: AuditCategory;
  createdAt: string;
}

interface StoredSettings {
  providers: Record<ProviderKey, ProviderConnection>;
  organization: OrganizationSettings;
  members: Member[];
  sessions: Session[];
  audit: AuditEvent[];
  twoFactorEnabled: boolean;
  loginAlertsEnabled: boolean;
  sessionTimeout: "7 days" | "30 days" | "90 days";
  calendarWaitlisted: boolean;
}

const SETTINGS_STORAGE_KEY = "trevv.settings.v1";
const SETTINGS_CHANGE_EVENT = "trevv-settings-change";
const SETTINGS_SECTION_EVENT = "trevv-settings-section-change";

const providers: ProviderDefinition[] = [
  {
    key: "google-drive",
    name: "Google Drive",
    category: "Deep integration",
    description: "Preview a permission-safe file and folder picker.",
    icon: "G",
    tone: "drive",
    mode: "deep",
    permissions: [
      "Choose files through the Google picker",
      "Read metadata for files you explicitly select",
      "Remove TREVV access at any time",
    ],
  },
  {
    key: "figma",
    name: "Figma",
    category: "Smart links",
    description: "Rich cards and safe embeds for design reviews.",
    icon: "F",
    tone: "figma",
    mode: "smart-link",
    permissions: [
      "Recognize links pasted into TREVV",
      "Show public metadata and an outbound link",
      "Never edit the original Figma file",
    ],
  },
  {
    key: "github",
    name: "GitHub",
    category: "Smart links",
    description: "Attach repositories, issues and pull requests.",
    icon: "G",
    tone: "github",
    mode: "smart-link",
    permissions: [
      "Recognize repository, issue, and pull-request links",
      "Show link metadata available to the viewer",
      "Never write to repositories",
    ],
  },
  {
    key: "canva",
    name: "Canva",
    category: "Smart links",
    description: "Reference designs and exported review assets.",
    icon: "C",
    tone: "canva",
    mode: "smart-link",
    permissions: [
      "Recognize Canva design links",
      "Display a safe preview when the link allows it",
      "Never edit or publish a Canva design",
    ],
  },
  {
    key: "google-calendar",
    name: "Google Calendar",
    category: "Release 1.1",
    description: "Milestones and review dates — not enabled in V1.",
    icon: "31",
    tone: "calendar",
    mode: "future",
    permissions: [],
  },
];

const initialAudit: AuditEvent[] = [
  {
    id: "audit-1",
    actor: "Mohammed Zaman",
    action: "Updated organization settings",
    target: "TREVV Demo",
    category: "Organization",
    createdAt: "2026-08-27T07:42:00.000Z",
  },
  {
    id: "audit-2",
    actor: "Mohammed Zaman",
    action: "Enabled Google Drive demo picker",
    target: "Google Drive",
    category: "Integration",
    createdAt: "2026-08-26T13:18:00.000Z",
  },
  {
    id: "audit-3",
    actor: "System",
    action: "Generated sample browser export",
    target: "Sample JSON export",
    category: "Export",
    createdAt: "2026-08-25T09:06:00.000Z",
  },
  {
    id: "audit-4",
    actor: "Mohammed Zaman",
    action: "Prepared a sample invitation",
    target: "lena@example.com",
    category: "Member",
    createdAt: "2026-08-22T14:30:00.000Z",
  },
  {
    id: "audit-5",
    actor: "System",
    action: "Displayed a fictional browser session",
    target: "Sample Chrome session",
    category: "Security",
    createdAt: "2026-08-20T06:55:00.000Z",
  },
];

const initialSettings: StoredSettings = {
  providers: {
    "google-drive": {
      status: "connected",
      label: "Demo picker",
      connectedAt: "2026-08-26T13:18:00.000Z",
    },
    figma: { status: "off" },
    github: { status: "off" },
    canva: { status: "off" },
    "google-calendar": { status: "off" },
  },
  organization: {
    name: "TREVV Demo",
    slug: "trevv-demo",
    timezone: "Europe/Berlin",
    language: "English",
    weekStartsOn: "Monday",
  },
  members: [
    {
      id: "member-mz",
      name: "Mohammed Zaman",
      email: "mohammed@trevv.de",
      initials: "MZ",
      role: "Owner",
      status: "active",
      lastActive: "Now",
      current: true,
    },
    {
      id: "member-nk",
      name: "Nora Klein",
      email: "nora@example.com",
      initials: "NK",
      role: "Admin",
      status: "active",
      lastActive: "18 minutes ago",
    },
    {
      id: "member-ad",
      name: "Amira Demir",
      email: "amira@example.com",
      initials: "AD",
      role: "Workspace lead",
      status: "active",
      lastActive: "Yesterday",
    },
    {
      id: "member-lr",
      name: "Lena Roth",
      email: "lena@example.com",
      initials: "LR",
      role: "Member",
      status: "invited",
      lastActive: "Draft prepared Aug 22",
    },
  ],
  sessions: [
    {
      id: "session-current",
      device: "Chrome on macOS",
      detail: "Berlin, Germany · This browser",
      activeAt: "Active now",
      kind: "desktop",
      current: true,
    },
    {
      id: "session-mobile",
      device: "Safari on iPhone",
      detail: "Berlin, Germany",
      activeAt: "Active 2 hours ago",
      kind: "mobile",
    },
    {
      id: "session-laptop",
      device: "TREVV Desktop on MacBook",
      detail: "Hamburg, Germany",
      activeAt: "Active 4 days ago",
      kind: "desktop",
    },
  ],
  audit: initialAudit,
  twoFactorEnabled: false,
  loginAlertsEnabled: true,
  sessionTimeout: "30 days",
  calendarWaitlisted: false,
};

const sectionCopy: Record<
  SettingsSection,
  { label: string; title: string; subtitle: string; icon: LucideIcon }
> = {
  integrations: {
    label: "Integrations",
    title: "Integrations",
    subtitle:
      "Preview optional provider behavior without connecting an account.",
    icon: Settings2,
  },
  security: {
    label: "Security",
    title: "Security",
    subtitle:
      "Review fictional account-security examples. Controls are inactive.",
    icon: ShieldCheck,
  },
  organization: {
    label: "Organization",
    title: "Organization",
    subtitle:
      "Set the defaults people see when they work in this organization.",
    icon: Building2,
  },
  members: {
    label: "Members",
    title: "Members",
    subtitle: "Explore a fictional member directory and invitation workflow.",
    icon: Users,
  },
  audit: {
    label: "Audit log",
    title: "Audit log",
    subtitle: "Review fictional, browser-local administration activity.",
    icon: Clock3,
  },
  export: {
    label: "Export",
    title: "Export & portability",
    subtitle: "Download samples generated from fictional browser data.",
    icon: Download,
  },
};

const settingsHintIds: Record<SettingsSection, string> = {
  integrations: "integrations",
  security: "security",
  organization: "organization-settings",
  members: "members-permissions",
  audit: "audit-log",
  export: "import-export",
};

export function sanitizeWorkspaceSlug(value: string): string {
  return value
    .toLocaleLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function loadStoredSettings(raw: string | null): StoredSettings {
  if (!raw) return initialSettings;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSettings>;
    return {
      ...initialSettings,
      ...parsed,
      providers: { ...initialSettings.providers, ...parsed.providers },
      organization: { ...initialSettings.organization, ...parsed.organization },
      members: Array.isArray(parsed.members)
        ? parsed.members.map((member) =>
            ["Workspace lead", "Project lead"].includes(member.role as string)
              ? { ...member, role: "Workspace lead" as const }
              : member,
          )
        : initialSettings.members,
      sessions: Array.isArray(parsed.sessions)
        ? parsed.sessions
        : initialSettings.sessions,
      audit: Array.isArray(parsed.audit) ? parsed.audit : initialSettings.audit,
    };
  } catch {
    return initialSettings;
  }
}

function subscribeToStoredSettings(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(SETTINGS_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(SETTINGS_CHANGE_EVENT, onStoreChange);
  };
}

function getStoredSettingsSnapshot(): string | null {
  return window.localStorage.getItem(SETTINGS_STORAGE_KEY);
}

function subscribeToSettingsSection(onStoreChange: () => void): () => void {
  window.addEventListener("hashchange", onStoreChange);
  window.addEventListener("popstate", onStoreChange);
  window.addEventListener(SETTINGS_SECTION_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("hashchange", onStoreChange);
    window.removeEventListener("popstate", onStoreChange);
    window.removeEventListener(SETTINGS_SECTION_EVENT, onStoreChange);
  };
}

function getSettingsSectionSnapshot(): string {
  return window.location.hash;
}

function sectionFromHash(hash: string): SettingsSection {
  const candidate = hash.replace(/^#/, "") as SettingsSection;
  return candidate in sectionCopy ? candidate : "integrations";
}

function createAuditEvent(
  action: string,
  target: string,
  category: AuditCategory,
): AuditEvent {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    actor: "Mohammed Zaman",
    action,
    target,
    category,
    createdAt: new Date().toISOString(),
  };
}

function withAudit(
  current: StoredSettings,
  action: string,
  target: string,
  category: AuditCategory,
): StoredSettings {
  return {
    ...current,
    audit: [createAuditEvent(action, target, category), ...current.audit].slice(
      0,
      100,
    ),
  };
}

function downloadFile(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatAuditTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}

export function SettingsExperience({
  workspaceSlug,
}: {
  workspaceSlug?: string;
}) {
  const sectionHash = useSyncExternalStore(
    subscribeToSettingsSection,
    getSettingsSectionSnapshot,
    () => "",
  );
  const activeSection = sectionFromHash(sectionHash);
  const storedSettings = useSyncExternalStore(
    subscribeToStoredSettings,
    getStoredSettingsSnapshot,
    () => null,
  );
  const settings = useMemo(
    () => loadStoredSettings(storedSettings),
    [storedSettings],
  );
  const [organizationDraftOverride, setOrganizationDraft] =
    useState<OrganizationSettings | null>(null);
  const organizationDraft = organizationDraftOverride ?? settings.organization;
  const [flash, setFlash] = useState("");
  const [providerDialog, setProviderDialog] = useState<ProviderKey | null>(
    null,
  );
  const [providerLabel, setProviderLabel] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("Member");
  const [memberQuery, setMemberQuery] = useState("");
  const [auditQuery, setAuditQuery] = useState("");
  const [auditCategory, setAuditCategory] = useState<AuditCategory | "All">(
    "All",
  );

  const setSettings = (update: (current: StoredSettings) => StoredSettings) => {
    const current = loadStoredSettings(
      window.localStorage.getItem(SETTINGS_STORAGE_KEY),
    );
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify(update(current)),
    );
    window.dispatchEvent(new Event(SETTINGS_CHANGE_EVENT));
  };

  useEffect(() => {
    if (!flash) return;
    const timeout = window.setTimeout(() => setFlash(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [flash]);

  const selectSection = (section: SettingsSection) => {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}#${section}`,
    );
    window.dispatchEvent(new Event(SETTINGS_SECTION_EVENT));
  };

  const notify = (message: string) => setFlash(message);

  const openProvider = (provider: ProviderDefinition) => {
    setProviderLabel(
      settings.providers[provider.key].label ?? `${provider.name} workspace`,
    );
    setProviderDialog(provider.key);
  };

  const saveProvider = (provider: ProviderDefinition) => {
    const status: ProviderStatus =
      provider.mode === "deep" ? "connected" : "enabled";
    setSettings((current) =>
      withAudit(
        {
          ...current,
          providers: {
            ...current.providers,
            [provider.key]: {
              status,
              label: providerLabel.trim() || `${provider.name} workspace`,
              connectedAt: new Date().toISOString(),
            },
          },
        },
        provider.mode === "deep"
          ? "Configured demo connection"
          : "Enabled smart-link previews",
        provider.name,
        "Integration",
      ),
    );
    setProviderDialog(null);
    notify(
      `${provider.name} ${provider.mode === "deep" ? "configuration" : "smart links"} saved.`,
    );
  };

  const disconnectProvider = (provider: ProviderDefinition) => {
    setSettings((current) =>
      withAudit(
        {
          ...current,
          providers: {
            ...current.providers,
            [provider.key]: { status: "off" },
          },
        },
        provider.mode === "deep"
          ? "Cleared demo configuration"
          : "Disabled smart-link previews",
        provider.name,
        "Integration",
      ),
    );
    setProviderDialog(null);
    notify(`${provider.name} has been turned off.`);
  };

  const toggleCalendarWaitlist = () => {
    setSettings((current) =>
      withAudit(
        { ...current, calendarWaitlisted: !current.calendarWaitlisted },
        current.calendarWaitlisted
          ? "Cleared sample release reminder"
          : "Saved sample release reminder",
        "Google Calendar",
        "Integration",
      ),
    );
    notify(
      settings.calendarWaitlisted
        ? "Sample reminder removed from this browser."
        : "Sample reminder saved in this browser; no notification will be sent.",
    );
  };

  const saveOrganization = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = {
      ...organizationDraft,
      name: organizationDraft.name.trim(),
      slug: sanitizeWorkspaceSlug(organizationDraft.slug),
    };
    if (!normalized.name || !normalized.slug) return;
    setOrganizationDraft(normalized);
    setSettings((current) =>
      withAudit(
        { ...current, organization: normalized },
        "Updated organization settings",
        normalized.name,
        "Organization",
      ),
    );
    notify("Sample organization settings saved in this browser.");
  };

  const changeMemberRole = (member: Member, role: MemberRole) => {
    setSettings((current) =>
      withAudit(
        {
          ...current,
          members: current.members.map((item) =>
            item.id === member.id ? { ...item, role } : item,
          ),
        },
        `Changed member role to ${role}`,
        member.email,
        "Member",
      ),
    );
    notify(`${member.name} is now ${role}.`);
  };

  const removeMember = (member: Member) => {
    setSettings((current) =>
      withAudit(
        {
          ...current,
          members: current.members.filter((item) => item.id !== member.id),
        },
        member.status === "invited"
          ? "Discarded invitation draft"
          : "Removed sample workspace member",
        member.email,
        "Member",
      ),
    );
    notify(
      member.status === "invited"
        ? `Invitation draft for ${member.email} discarded in this browser.`
        : `${member.name} removed from the fictional directory in this browser.`,
    );
  };

  const inviteMember = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = inviteEmail.trim().toLocaleLowerCase();
    if (
      !email ||
      settings.members.some(
        (member) => member.email.toLocaleLowerCase() === email,
      )
    ) {
      notify(
        email
          ? "That person is already a member or has a pending invite."
          : "Enter an email address.",
      );
      return;
    }
    const name = email
      .split("@")[0]!
      .split(/[._-]/)
      .filter(Boolean)
      .map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`)
      .join(" ");
    const initials = name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    const member: Member = {
      id: `member-${Date.now()}`,
      name: name || email,
      email,
      initials: initials || "?",
      role: inviteRole,
      status: "invited",
      lastActive: "Draft prepared just now",
    };
    setSettings((current) =>
      withAudit(
        { ...current, members: [...current.members, member] },
        `Prepared a sample ${inviteRole.toLocaleLowerCase()} invitation`,
        email,
        "Member",
      ),
    );
    setInviteEmail("");
    setInviteRole("Member");
    setInviteOpen(false);
    notify(`Invitation draft prepared for ${email}; no email was sent.`);
  };

  const resendInvite = (member: Member) => {
    setSettings((current) =>
      withAudit(current, "Refreshed invitation draft", member.email, "Member"),
    );
    notify(
      `Invitation draft refreshed for ${member.email}; no email was sent.`,
    );
  };

  const exportOrganization = () => {
    const portable = {
      exportedAt: new Date().toISOString(),
      formatVersion: 1,
      organization: settings.organization,
      administration: {
        members: settings.members.map(({ id, name, email, role, status }) => ({
          id,
          name,
          email,
          role,
          status,
        })),
        enabledIntegrations: Object.entries(settings.providers)
          .filter(([, connection]) => connection.status !== "off")
          .map(([provider, connection]) => ({
            provider,
            status: connection.status,
          })),
      },
      data: {
        portfolios: 2,
        workspaces: 6,
        note: "Demo workspace content is provided by the deterministic TREVV seed.",
      },
    };
    downloadFile(
      "trevv-organization-export.json",
      JSON.stringify(portable, null, 2),
      "application/json",
    );
    setSettings((current) =>
      withAudit(
        current,
        "Downloaded sample organization export",
        "Sample JSON export",
        "Export",
      ),
    );
    notify("Sample browser-data export downloaded.");
  };

  const exportMembers = () => {
    const header = ["name", "email", "role", "status"];
    const rows = settings.members.map((member) =>
      [member.name, member.email, member.role, member.status]
        .map(safeCsvCell)
        .join(","),
    );
    downloadFile(
      "trevv-members.csv",
      [header.join(","), ...rows].join("\n"),
      "text/csv;charset=utf-8",
    );
    setSettings((current) =>
      withAudit(
        current,
        "Downloaded sample member list",
        "Sample members CSV",
        "Export",
      ),
    );
    notify("Sample member list downloaded from this browser.");
  };

  const exportAudit = () => {
    const rows = settings.audit.map((event) =>
      [event.createdAt, event.actor, event.category, event.action, event.target]
        .map(safeCsvCell)
        .join(","),
    );
    downloadFile(
      "trevv-audit-log.csv",
      ["timestamp,actor,category,action,target", ...rows].join("\n"),
      "text/csv;charset=utf-8",
    );
    setSettings((current) =>
      withAudit(
        current,
        "Downloaded sample activity",
        "Sample activity CSV",
        "Export",
      ),
    );
    notify("Sample browser activity downloaded.");
  };

  const visibleMembers = useMemo(() => {
    const query = memberQuery.trim().toLocaleLowerCase();
    if (!query) return settings.members;
    return settings.members.filter((member) =>
      `${member.name} ${member.email} ${member.role}`
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [memberQuery, settings.members]);

  const visibleAudit = useMemo(() => {
    const query = auditQuery.trim().toLocaleLowerCase();
    return settings.audit.filter(
      (event) =>
        (auditCategory === "All" || event.category === auditCategory) &&
        (!query ||
          `${event.actor} ${event.action} ${event.target}`
            .toLocaleLowerCase()
            .includes(query)),
    );
  }, [auditCategory, auditQuery, settings.audit]);

  const currentCopy = sectionCopy[activeSection];
  const selectedProvider =
    providers.find((provider) => provider.key === providerDialog) ?? null;

  return (
    <WorkspaceFrame active="settings" workspaceSlug={workspaceSlug}>
      <main className="focus-main settings-page">
        <header className="focus-header settings-page-header">
          <div>
            <p>TREVV / Settings</p>
            <h1 className="page-title-with-hint">
              {currentCopy.title}
              <Hint resourceId={settingsHintIds[activeSection]} />
            </h1>
            <span>{currentCopy.subtitle}</span>
          </div>
          {activeSection === "members" && (
            <button
              className="primary-button"
              type="button"
              onClick={() => setInviteOpen(true)}
            >
              <UserPlus size={15} /> Prepare sample invite
            </button>
          )}
        </header>

        {flash && (
          <div className="settings-flash" role="status" aria-live="polite">
            <CheckCircle2 size={16} />
            <span>{flash}</span>
            <button
              type="button"
              onClick={() => setFlash("")}
              aria-label="Dismiss message"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="settings-shell">
          <aside className="settings-navigation" aria-label="Settings sections">
            {(
              Object.entries(sectionCopy) as Array<
                [SettingsSection, (typeof sectionCopy)[SettingsSection]]
              >
            ).map(([key, item]) => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  className={activeSection === key ? "active" : ""}
                  aria-current={activeSection === key ? "page" : undefined}
                  onClick={() => selectSection(key)}
                  key={key}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                  <ArrowRight size={13} />
                </button>
              );
            })}
          </aside>

          <section className="settings-content" aria-label={currentCopy.title}>
            {activeSection === "integrations" && (
              <IntegrationsPanel
                settings={settings}
                onOpen={openProvider}
                onToggleCalendar={toggleCalendarWaitlist}
              />
            )}
            {activeSection === "security" && <SecurityPanel />}
            {activeSection === "organization" && (
              <OrganizationPanel
                draft={organizationDraft}
                saved={settings.organization}
                onChange={setOrganizationDraft}
                onSave={saveOrganization}
                onReset={() => setOrganizationDraft(settings.organization)}
              />
            )}
            {activeSection === "members" && (
              <MembersPanel
                members={visibleMembers}
                query={memberQuery}
                onQuery={setMemberQuery}
                onRole={changeMemberRole}
                onRemove={setMemberToRemove}
                onResend={resendInvite}
                onInvite={() => setInviteOpen(true)}
              />
            )}
            {activeSection === "audit" && (
              <AuditPanel
                events={visibleAudit}
                query={auditQuery}
                category={auditCategory}
                onQuery={setAuditQuery}
                onCategory={setAuditCategory}
                onExport={exportAudit}
              />
            )}
            {activeSection === "export" && (
              <ExportPanel
                members={settings.members.length}
                auditEvents={settings.audit.length}
                onOrganization={exportOrganization}
                onMembers={exportMembers}
                onAudit={exportAudit}
                importHref={
                  workspaceSlug
                    ? `/app/workspaces/${encodeURIComponent(workspaceSlug)}/settings/import`
                    : "/app/settings/import"
                }
              />
            )}
          </section>
        </div>

        {selectedProvider && (
          <ProviderDialog
            provider={selectedProvider}
            connection={settings.providers[selectedProvider.key]}
            label={providerLabel}
            onLabel={setProviderLabel}
            onSave={() => saveProvider(selectedProvider)}
            onDisconnect={() => disconnectProvider(selectedProvider)}
            onClose={() => setProviderDialog(null)}
          />
        )}
        {inviteOpen && (
          <InviteDialog
            email={inviteEmail}
            role={inviteRole}
            onEmail={setInviteEmail}
            onRole={setInviteRole}
            onSubmit={inviteMember}
            onClose={() => setInviteOpen(false)}
          />
        )}
        {memberToRemove && (
          <RemoveMemberDialog
            member={memberToRemove}
            onConfirm={() => {
              removeMember(memberToRemove);
              setMemberToRemove(null);
            }}
            onClose={() => setMemberToRemove(null)}
          />
        )}
      </main>
    </WorkspaceFrame>
  );
}

function IntegrationsPanel({
  settings,
  onOpen,
  onToggleCalendar,
}: {
  settings: StoredSettings;
  onOpen: (provider: ProviderDefinition) => void;
  onToggleCalendar: () => void;
}) {
  return (
    <div className="settings-stack">
      <CapabilityNotice capability="integrations" />
      <div className="settings-note">
        <ShieldCheck size={18} />
        <div>
          <strong>Optional by design</strong>
          <span>
            These preview settings stay in this browser. No provider account is
            connected or synchronized.
          </span>
        </div>
      </div>
      <section className="settings-card provider-list complete-provider-list">
        {providers.map((provider) => {
          const connection = settings.providers[provider.key];
          const active = connection.status !== "off";
          return (
            <article key={provider.key}>
              <span
                className={`provider-icon provider-tone-${provider.tone}`}
                aria-hidden="true"
              >
                {provider.icon}
              </span>
              <div className="provider-copy">
                <p>{provider.category}</p>
                <h2>{provider.name}</h2>
                <span>{provider.description}</span>
              </div>
              {provider.mode === "future" ? (
                <button
                  type="button"
                  className={settings.calendarWaitlisted ? "configured" : ""}
                  onClick={onToggleCalendar}
                >
                  {settings.calendarWaitlisted ? (
                    <Check size={13} />
                  ) : (
                    <BellRing size={13} />
                  )}
                  {settings.calendarWaitlisted
                    ? "Sample reminder saved"
                    : "Preview reminder"}
                </button>
              ) : (
                <button
                  type="button"
                  className={active ? "configured" : ""}
                  onClick={() => onOpen(provider)}
                >
                  {active && <CheckCircle2 size={13} />}
                  {active
                    ? "Manage preview"
                    : provider.mode === "smart-link"
                      ? "Preview"
                      : "Configure preview"}
                  <ArrowRight size={12} />
                </button>
              )}
            </article>
          );
        })}
      </section>
      <p className="settings-footnote">
        Smart-link previews only enrich URLs a member deliberately adds. Deep
        provider access, OAuth, sync, and writes are not active.
      </p>
    </div>
  );
}

function SecurityPanel() {
  const session = useAppSession();
  return (
    <div className="settings-stack">
      <section className="settings-card settings-section-card">
        <SettingsHeading
          icon={ShieldCheck}
          title="Account protection"
          subtitle="Manage real server-side sessions from the dedicated account surface."
        />
        <div className="settings-security-links">
          <Link className="primary-button" href="/app/account/sessions">
            Review and revoke sessions <ArrowRight size={13} />
          </Link>
          {session.organization.role === "owner" ||
          session.organization.role === "admin" ? (
            <Link href="/app/account/invitations">
              Manage organization invitations <ArrowRight size={13} />
            </Link>
          ) : null}
        </div>
        <p className="settings-footnote">
          Multi-factor authentication, passkeys, login alerts, and configurable
          session timeouts are hidden until they are fully implemented.
        </p>
      </section>
    </div>
  );
}

function OrganizationPanel({
  draft,
  saved,
  onChange,
  onSave,
  onReset,
}: {
  draft: OrganizationSettings;
  saved: OrganizationSettings;
  onChange: (value: OrganizationSettings) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
}) {
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  return (
    <form className="settings-card organization-form" onSubmit={onSave}>
      <CapabilityNotice capability="browserChanges" />
      <SettingsHeading
        icon={Building2}
        title="Sample Workspace details"
        subtitle="These browser-local defaults illustrate a future organization configuration."
      />
      <div className="settings-form-grid">
        <label className="full-width">
          <span>Organization name</span>
          <input
            required
            maxLength={80}
            value={draft.name}
            onChange={(event) =>
              onChange({ ...draft, name: event.target.value })
            }
          />
        </label>
        <label className="full-width">
          <span>Workspace URL</span>
          <div className="slug-input">
            <span>trevv.app/</span>
            <input
              required
              pattern="[a-z0-9-]+"
              maxLength={48}
              aria-label="Workspace URL slug"
              value={draft.slug}
              onChange={(event) =>
                onChange({
                  ...draft,
                  slug: sanitizeWorkspaceSlug(event.target.value),
                })
              }
            />
          </div>
          <small>Lowercase letters, numbers, and hyphens only.</small>
        </label>
        <label>
          <span>Default timezone</span>
          <select
            value={draft.timezone}
            onChange={(event) =>
              onChange({ ...draft, timezone: event.target.value })
            }
          >
            <option value="Europe/Berlin">Europe/Berlin (CET)</option>
            <option value="Europe/London">Europe/London (GMT)</option>
            <option value="America/New_York">America/New York (ET)</option>
            <option value="Asia/Dubai">Asia/Dubai (GST)</option>
          </select>
        </label>
        <label>
          <span>Default language</span>
          <select
            value={draft.language}
            onChange={(event) =>
              onChange({
                ...draft,
                language: event.target
                  .value as OrganizationSettings["language"],
              })
            }
          >
            <option>English</option>
            <option>Deutsch</option>
          </select>
        </label>
        <label>
          <span>Week starts on</span>
          <select
            value={draft.weekStartsOn}
            onChange={(event) =>
              onChange({
                ...draft,
                weekStartsOn: event.target
                  .value as OrganizationSettings["weekStartsOn"],
              })
            }
          >
            <option>Monday</option>
            <option>Sunday</option>
          </select>
        </label>
      </div>
      <footer className="settings-form-actions">
        <span>
          {dirty
            ? "You have unsaved browser-local changes."
            : "Sample settings are saved in this browser."}
        </span>
        <button type="button" onClick={onReset} disabled={!dirty}>
          Discard
        </button>
        <button
          className="primary-button"
          type="submit"
          disabled={!dirty || !draft.name.trim() || !draft.slug}
        >
          Save in this browser
        </button>
      </footer>
    </form>
  );
}

function MembersPanel({
  members,
  query,
  onQuery,
  onRole,
  onRemove,
  onResend,
  onInvite,
}: {
  members: Member[];
  query: string;
  onQuery: (value: string) => void;
  onRole: (member: Member, role: MemberRole) => void;
  onRemove: (member: Member) => void;
  onResend: (member: Member) => void;
  onInvite: () => void;
}) {
  return (
    <section className="settings-card members-card">
      <CapabilityNotice capability="invitations" />
      <div className="settings-toolbar">
        <label className="settings-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search members…"
          />
        </label>
        <span>{members.length} shown</span>
      </div>
      <div className="member-list">
        {members.map((member) => (
          <article key={member.id}>
            <span className="member-avatar">{member.initials}</span>
            <div className="member-identity">
              <strong>
                {member.name}
                {member.current && <small>You</small>}
              </strong>
              <span>{member.email}</span>
            </div>
            <div className="member-activity">
              <span className={`member-status ${member.status}`}>
                <i />{" "}
                {member.status === "active" ? "Sample member" : "Draft invite"}
              </span>
              <small>{member.lastActive}</small>
            </div>
            <select
              aria-label={`Role for ${member.name}`}
              value={member.role}
              disabled={member.current}
              onChange={(event) =>
                onRole(member, event.target.value as MemberRole)
              }
            >
              <option>Owner</option>
              <option>Admin</option>
              <option>Workspace lead</option>
              <option>Member</option>
              <option>Stakeholder</option>
            </select>
            {member.current ? (
              <span className="member-owner-lock">
                <ShieldCheck size={14} /> Protected
              </span>
            ) : member.status === "invited" ? (
              <div className="member-actions">
                <button type="button" onClick={() => onResend(member)}>
                  <RefreshCw size={13} /> Refresh draft
                </button>
                <button
                  type="button"
                  className="icon-danger"
                  onClick={() => onRemove(member)}
                  aria-label={`Discard invitation draft for ${member.email}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="remove-member"
                onClick={() => onRemove(member)}
              >
                Remove from sample
              </button>
            )}
          </article>
        ))}
      </div>
      {!members.length && (
        <div className="settings-empty">
          <Users size={24} />
          <h2>No members found</h2>
          <p>Try a different search or prepare another sample invite.</p>
          <button className="primary-button" type="button" onClick={onInvite}>
            Prepare sample invite
          </button>
        </div>
      )}
    </section>
  );
}

function AuditPanel({
  events,
  query,
  category,
  onQuery,
  onCategory,
  onExport,
}: {
  events: AuditEvent[];
  query: string;
  category: AuditCategory | "All";
  onQuery: (value: string) => void;
  onCategory: (value: AuditCategory | "All") => void;
  onExport: () => void;
}) {
  return (
    <section className="settings-card audit-card">
      <CapabilityNotice capability="export" />
      <div className="settings-toolbar audit-toolbar">
        <label className="settings-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search activity…"
          />
        </label>
        <select
          aria-label="Audit category"
          value={category}
          onChange={(event) =>
            onCategory(event.target.value as AuditCategory | "All")
          }
        >
          <option>All</option>
          <option>Integration</option>
          <option>Security</option>
          <option>Organization</option>
          <option>Member</option>
          <option>Export</option>
        </select>
        <button type="button" onClick={onExport}>
          <Download size={14} /> Download sample CSV
        </button>
      </div>
      <div className="audit-list">
        {events.map((event) => (
          <article key={event.id}>
            <span
              className={`audit-icon audit-${event.category.toLocaleLowerCase()}`}
              aria-hidden="true"
            >
              {event.category.slice(0, 1)}
            </span>
            <div>
              <strong>{event.action}</strong>
              <span>
                {event.actor} · {event.target}
              </span>
            </div>
            <b>{event.category}</b>
            <time dateTime={event.createdAt}>
              {formatAuditTime(event.createdAt)}
            </time>
          </article>
        ))}
      </div>
      {!events.length && (
        <div className="settings-empty compact">
          <Search size={22} />
          <h2>No matching activity</h2>
          <p>Change the search or category filter to see more events.</p>
        </div>
      )}
    </section>
  );
}

function ExportPanel({
  members,
  auditEvents,
  onOrganization,
  onMembers,
  onAudit,
  importHref,
}: {
  members: number;
  auditEvents: number;
  onOrganization: () => void;
  onMembers: () => void;
  onAudit: () => void;
  importHref: string;
}) {
  return (
    <div className="settings-stack">
      <CapabilityNotice capability="export" />
      <div className="export-grid">
        <ExportCard
          icon={FileJson}
          title="Sample organization data"
          description="A portable JSON summary of organization settings, members, providers, and demo-workspace counts."
          meta="JSON · generated on demand"
          action="Download sample JSON"
          onClick={onOrganization}
        />
        <ExportCard
          icon={FileSpreadsheet}
          title="Sample member directory"
          description="Names, email addresses, roles, and invitation status for workspace administration."
          meta={`${members} people · CSV`}
          action="Download sample CSV"
          onClick={onMembers}
        />
        <ExportCard
          icon={Clock3}
          title="Sample activity"
          description="Important workspace administration and security activity currently retained in this demo."
          meta={`${auditEvents} events · CSV`}
          action="Download sample CSV"
          onClick={onAudit}
        />
      </div>
      <section className="settings-card portability-card">
        <span className="settings-list-icon">
          <Database size={18} />
        </span>
        <div>
          <h2>Preview bringing work into TREVV</h2>
          <p>
            Preview field mappings and validation warnings before importing any
            CSV rows.
          </p>
        </div>
        <Link href={importHref}>
          Open import preview <ArrowRight size={13} />
        </Link>
      </section>
      <div className="settings-note neutral-note">
        <ShieldCheck size={18} />
        <div>
          <strong>Sample download only</strong>
          <span>
            Downloads are created from fictional browser data. Complete,
            permission-checked and auditable organization exports are not yet
            available.
          </span>
        </div>
      </div>
    </div>
  );
}

function ExportCard({
  icon: Icon,
  title,
  description,
  meta,
  action,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  meta: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <article className="settings-card export-card">
      <span className="export-card-icon">
        <Icon size={20} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      <small>{meta}</small>
      <button type="button" onClick={onClick}>
        <Download size={14} /> {action}
      </button>
    </article>
  );
}

function SettingsHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <header className="settings-section-heading">
      <span>
        <Icon size={17} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </header>
  );
}

function ProviderDialog({
  provider,
  connection,
  label,
  onLabel,
  onSave,
  onDisconnect,
  onClose,
}: {
  provider: ProviderDefinition;
  connection: ProviderConnection;
  label: string;
  onLabel: (value: string) => void;
  onSave: () => void;
  onDisconnect: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const active = connection.status !== "off";
  return (
    <SettingsDialog titleId={titleId} onClose={onClose}>
      <header className="settings-dialog-header">
        <span className={`provider-icon provider-tone-${provider.tone}`}>
          {provider.icon}
        </span>
        <div>
          <p>{provider.category}</p>
          <h2 id={titleId}>
            {active
              ? `Manage ${provider.name} preview`
              : `Preview ${provider.name}`}
          </h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close dialog">
          <X size={18} />
        </button>
      </header>
      <div className="settings-dialog-body">
        <div className="integration-mode-note">
          {provider.mode === "deep" ? (
            <ShieldCheck size={17} />
          ) : (
            <Link2 size={17} />
          )}
          <div>
            <strong>
              {provider.mode === "deep"
                ? "Safe demo connection"
                : "Metadata preview only"}
            </strong>
            <span>
              {provider.mode === "deep"
                ? "This V1 demo configures the permission-safe picker seam. It does not store a production OAuth token."
                : "TREVV enriches links members deliberately paste. No account sign-in or write access is requested."}
            </span>
          </div>
        </div>
        <label className="dialog-field">
          <span>Connection label</span>
          <input
            autoFocus
            required
            maxLength={60}
            value={label}
            onChange={(event) => onLabel(event.target.value)}
          />
        </label>
        <div className="permission-list">
          <strong>What a future live version would enable</strong>
          {provider.permissions.map((permission) => (
            <span key={permission}>
              <CheckCircle2 size={14} /> {permission}
            </span>
          ))}
        </div>
        {active && connection.connectedAt && (
          <p className="connection-meta">
            <Clock3 size={13} /> Preview configured{" "}
            {formatAuditTime(connection.connectedAt)}
          </p>
        )}
      </div>
      <footer className="settings-dialog-actions split-actions">
        {active ? (
          <button
            type="button"
            className="danger-button"
            onClick={onDisconnect}
          >
            Clear preview
          </button>
        ) : (
          <span />
        )}
        <div>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={!label.trim()}
            onClick={onSave}
          >
            {active
              ? "Save preview settings"
              : provider.mode === "deep"
                ? "Configure picker preview"
                : "Enable link preview"}
          </button>
        </div>
      </footer>
    </SettingsDialog>
  );
}

function InviteDialog({
  email,
  role,
  onEmail,
  onRole,
  onSubmit,
  onClose,
}: {
  email: string;
  role: MemberRole;
  onEmail: (value: string) => void;
  onRole: (value: MemberRole) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  return (
    <SettingsDialog titleId={titleId} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <header className="settings-dialog-header">
          <span className="dialog-title-icon">
            <UserPlus size={18} />
          </span>
          <div>
            <p>Fictional directory</p>
            <h2 id={titleId}>Prepare a sample invitation</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </header>
        <div className="settings-dialog-body invite-fields">
          <CapabilityNotice capability="invitations" />
          <label className="dialog-field">
            <span>Email address</span>
            <div className="input-with-icon">
              <Mail size={15} />
              <input
                autoFocus
                required
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(event) => onEmail(event.target.value)}
              />
            </div>
          </label>
          <label className="dialog-field">
            <span>Role</span>
            <select
              value={role}
              onChange={(event) => onRole(event.target.value as MemberRole)}
            >
              <option>Admin</option>
              <option>Workspace lead</option>
              <option>Member</option>
              <option>Stakeholder</option>
            </select>
          </label>
          <div className="role-explainer">
            <ShieldCheck size={16} />
            <p>
              <strong>{role}</strong>
              <span>{roleDescription(role)}</span>
            </p>
          </div>
        </div>
        <footer className="settings-dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            type="submit"
            disabled={!email.trim()}
          >
            Prepare invitation draft
          </button>
        </footer>
      </form>
    </SettingsDialog>
  );
}

function RemoveMemberDialog({
  member,
  onConfirm,
  onClose,
}: {
  member: Member;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const invitation = member.status === "invited";
  return (
    <SettingsDialog titleId={titleId} onClose={onClose}>
      <header className="settings-dialog-header">
        <span className="dialog-danger-icon">
          <Trash2 size={18} />
        </span>
        <div>
          <p>{invitation ? "Invitation draft" : "Fictional directory"}</p>
          <h2 id={titleId}>
            {invitation
              ? "Discard this invitation draft?"
              : "Remove this sample member?"}
          </h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close dialog">
          <X size={18} />
        </button>
      </header>
      <div className="settings-dialog-body remove-member-copy">
        <p>
          {invitation
            ? `The browser-local invitation draft for ${member.email} will be removed. No access was ever granted.`
            : `${member.name} will be removed from this browser-only fictional directory. Real access is unaffected.`}
        </p>
        <div>
          <span className="member-avatar">{member.initials}</span>
          <p>
            <strong>{member.name}</strong>
            <span>{member.email}</span>
          </p>
          <b>{member.role}</b>
        </div>
      </div>
      <footer className="settings-dialog-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="confirm-danger-button"
          onClick={onConfirm}
        >
          {invitation ? "Discard draft" : "Remove sample member"}
        </button>
      </footer>
    </SettingsDialog>
  );
}

function SettingsDialog({
  titleId,
  onClose,
  children,
}: {
  titleId: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="settings-dialog-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>
  );
}

function roleDescription(role: MemberRole): string {
  const descriptions: Record<MemberRole, string> = {
    Owner:
      "Full organization access, including ownership and deletion controls.",
    Admin:
      "Can manage organization settings, members, templates, and integrations.",
    "Workspace lead":
      "Can manage assigned Workspaces and the people working in them.",
    Member: "Can create and update work in Workspaces they can access.",
    Stakeholder: "Read-only access to explicitly shared stakeholder views.",
  };
  return descriptions[role];
}

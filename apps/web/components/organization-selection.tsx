"use client";

import { ArrowRight, Building2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { trevvBrand } from "@/lib/branding";

interface OrganizationChoice {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export function OrganizationSelection({ returnTo }: { returnTo: string }) {
  const [organizations, setOrganizations] = useState<OrganizationChoice[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/session/organizations", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (response.status === 401) {
          window.location.replace(
            `/sign-in?next=${encodeURIComponent("/select-organization")}`,
          );
          return;
        }
        const code = apiErrorCode(body);
        if (response.status === 409 && code === "onboarding_required") {
          window.location.replace("/onboarding");
          return;
        }
        if (!response.ok || !isOrganizationChoices(body))
          throw new Error(
            apiErrorMessage(body, "Organizations could not be loaded."),
          );
        if (!active) return;
        setOrganizations(body);
        setSelectedId((current) => current || body[0]?.id || "");
      })
      .catch((error: unknown) => {
        if (active)
          setMessage(
            error instanceof Error
              ? error.message
              : "Organizations could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function choose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/session/organization", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ organizationId: selectedId }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          apiErrorMessage(body, "That organization could not be selected."),
        );
      window.location.replace(returnTo);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "That organization could not be selected.",
      );
      setPending(false);
    }
  }

  return (
    <main className="public-auth-page">
      <form
        className="public-auth-card organization-selection-card"
        onSubmit={choose}
      >
        <a className="auth-brand" href="/sign-in">
          <span className="brand-mark">
            <span>T</span>
          </span>
          <strong>{trevvBrand.name}</strong>
        </a>
        <span className="onboarding-icon">
          <Building2 size={18} />
        </span>
        <h1>Choose an organization</h1>
        <p>
          TREVV uses the selected server-side membership as the tenant for every
          following request.
        </p>
        {loading ? <p role="status">Loading your memberships…</p> : null}
        {!loading && organizations.length === 0 && !message ? (
          <p>No active organization memberships are available.</p>
        ) : null}
        <div className="organization-choice-list">
          {organizations.map((organization) => (
            <label key={organization.id}>
              <input
                checked={selectedId === organization.id}
                disabled={pending}
                name="organization"
                onChange={() => setSelectedId(organization.id)}
                type="radio"
              />
              <span>
                <strong>{organization.name}</strong>
                <small>
                  {roleLabel(organization.role)} · {organization.slug}
                </small>
              </span>
            </label>
          ))}
        </div>
        {message ? (
          <p className="auth-message" role="status">
            {message}
          </p>
        ) : null}
        <button
          className="primary-button"
          disabled={loading || pending || !selectedId}
          type="submit"
        >
          {pending ? "Opening…" : "Open organization"} <ArrowRight size={14} />
        </button>
      </form>
    </main>
  );
}

function isOrganizationChoices(value: unknown): value is OrganizationChoice[] {
  return (
    Array.isArray(value) &&
    value.every((entry) =>
      Boolean(
        entry &&
        typeof entry === "object" &&
        typeof (entry as { id?: unknown }).id === "string" &&
        typeof (entry as { name?: unknown }).name === "string" &&
        typeof (entry as { slug?: unknown }).slug === "string" &&
        typeof (entry as { role?: unknown }).role === "string",
      ),
    )
  );
}

function apiErrorCode(value: unknown): string {
  return value &&
    typeof value === "object" &&
    "error" in value &&
    (value as { error?: unknown }).error &&
    typeof (value as { error: { code?: unknown } }).error.code === "string"
    ? (value as { error: { code: string } }).error.code
    : "";
}

function apiErrorMessage(value: unknown, fallback: string): string {
  return value &&
    typeof value === "object" &&
    "error" in value &&
    (value as { error?: unknown }).error &&
    typeof (value as { error: { message?: unknown } }).error.message ===
      "string"
    ? (value as { error: { message: string } }).error.message
    : fallback;
}

function roleLabel(role: string): string {
  return role === "workspace_lead"
    ? "Workspace lead"
    : `${role.slice(0, 1).toUpperCase()}${role.slice(1)}`;
}

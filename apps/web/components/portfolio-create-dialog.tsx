"use client";

import { CheckCircle2, Plus, X } from "lucide-react";
import type {
  CreatePortfolioInput,
  PortfolioDto,
} from "@founderhq/api-contract";
import { useState, type FormEvent, type CSSProperties } from "react";
import {
  createCustomPortfolio,
  portfolioAccentOptions,
} from "@/lib/custom-portfolios";
import { availableSlug } from "@/lib/available-slug";
import { presentLiveError } from "@/lib/live-errors";
import { LiveStateNotice } from "./live-state";

export function PortfolioCreateDialog({
  mode,
  existingSlugs,
  onClose,
  onCreateLive,
  onCreated,
}: {
  mode: "demo" | "live";
  existingSlugs: readonly string[];
  onClose: () => void;
  onCreateLive?: (
    input: CreatePortfolioInput,
    idempotencyKey: string,
  ) => Promise<PortfolioDto>;
  onCreated: (portfolio: Pick<PortfolioDto, "id">) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [mark, setMark] = useState("");
  const [markEdited, setMarkEdited] = useState(false);
  const [accent, setAccent] = useState<string>(portfolioAccentOptions[0]);
  const [isDefault, setIsDefault] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  const resetFailedAttempt = () => {
    if (!error) return;
    setError(null);
    setIdempotencyKey(crypto.randomUUID());
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || pending) return;
    if (mode === "demo") {
      onCreated(
        createCustomPortfolio({
          name,
          description,
          mark: mark || name.trim().slice(0, 1),
          accent,
        }).portfolio,
      );
      return;
    }
    if (!onCreateLive || !slug.trim()) return;
    setPending(true);
    setError(null);
    try {
      onCreated(
        await onCreateLive(
          {
            name: name.trim(),
            slug: slug.trim(),
            description: description.trim(),
            isDefault,
          },
          idempotencyKey,
        ),
      );
    } catch (reason) {
      setError(reason);
    } finally {
      setPending(false);
    }
  };

  const presentedError = error ? presentLiveError(error) : null;

  return (
    <div className="dialog-layer" role="presentation" onMouseDown={onClose}>
      <form
        className="capture-dialog create-portfolio-dialog"
        aria-labelledby="create-portfolio-title"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
        role="dialog"
      >
        <header>
          <span
            className="portfolio-logo-preview"
            style={{ background: `${accent}18`, color: accent }}
            aria-hidden="true"
          >
            {mark || name.trim().slice(0, 1).toUpperCase() || "P"}
          </span>
          <div>
            <h2 id="create-portfolio-title">Create a portfolio</h2>
            <p>
              Group related Workspaces under one recognizable identity and
              overview.
            </p>
          </div>
          <button
            aria-label="Close portfolio creation"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </header>

        <div className="create-portfolio-fields">
          {presentedError ? (
            <LiveStateNotice
              description={presentedError.description}
              kind={presentedError.kind}
              title={presentedError.title}
            />
          ) : pending ? (
            <LiveStateNotice
              description="TREVV will show the Portfolio only after the server commits it."
              kind="pending"
              title="Creating Portfolio"
            />
          ) : null}
          <label>
            Portfolio name
            <input
              autoFocus
              disabled={pending}
              maxLength={160}
              onChange={(event) => {
                const nextName = event.currentTarget.value;
                setName(nextName);
                if (!markEdited)
                  setMark(nextName.trim().slice(0, 1).toUpperCase());
                if (!slugEdited)
                  setSlug(availableSlug(nextName, existingSlugs));
                resetFailedAttempt();
              }}
              placeholder="For example, European Ventures"
              required
              value={name}
            />
          </label>
          {mode === "live" ? (
            <div className="portfolio-identity-fields">
              <label>
                URL slug
                <input
                  disabled={pending}
                  maxLength={80}
                  minLength={2}
                  onChange={(event) => {
                    setSlugEdited(true);
                    setSlug(event.currentTarget.value);
                    resetFailedAttempt();
                  }}
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  required
                  value={slug}
                />
                <small>Lowercase letters, numbers, and single hyphens</small>
              </label>
              <label>
                <input
                  checked={isDefault}
                  disabled={pending}
                  onChange={(event) => {
                    setIsDefault(event.currentTarget.checked);
                    resetFailedAttempt();
                  }}
                  type="checkbox"
                />{" "}
                Make this the default Portfolio
              </label>
            </div>
          ) : (
            <div className="portfolio-identity-fields">
              <label>
                Logo mark
                <input
                  aria-describedby="portfolio-mark-help"
                  disabled={pending}
                  maxLength={2}
                  onChange={(event) => {
                    setMarkEdited(true);
                    setMark(event.currentTarget.value.toUpperCase());
                  }}
                  placeholder="EV"
                  value={mark}
                />
                <small id="portfolio-mark-help">One or two characters</small>
              </label>
              <fieldset>
                <legend>Brand colour</legend>
                <div className="portfolio-accent-options">
                  {portfolioAccentOptions.map((option) => (
                    <button
                      type="button"
                      aria-label={`Use portfolio colour ${option}`}
                      aria-pressed={accent === option}
                      className={accent === option ? "selected" : ""}
                      disabled={pending}
                      key={option}
                      onClick={() => setAccent(option)}
                      style={{ "--portfolio-accent": option } as CSSProperties}
                    >
                      {accent === option && <CheckCircle2 size={13} />}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          )}
          <label>
            Purpose
            <textarea
              disabled={pending}
              maxLength={1_000}
              onChange={(event) => {
                setDescription(event.currentTarget.value);
                resetFailedAttempt();
              }}
              placeholder="What related Workspaces and outcomes belong here?"
              rows={3}
              value={description}
            />
          </label>
        </div>

        <footer>
          <span>You can add the first workspace immediately afterwards.</span>
          <div>
            <button onClick={onClose} type="button">
              Cancel
            </button>
            <button
              className="primary-button"
              disabled={
                pending ||
                !name.trim() ||
                (mode === "live" && slug.trim().length < 2)
              }
              type="submit"
            >
              <Plus size={14} /> {pending ? "Creating…" : "Create portfolio"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

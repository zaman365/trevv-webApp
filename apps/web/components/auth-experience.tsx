"use client";

import {
  ArrowRight,
  Check,
  ChevronLeft,
  Eye,
  EyeOff,
  Grid2X2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { productCopy } from "@/lib/product-copy";
import { trevvBrand } from "@/lib/branding";

export function AuthExperience({ mode }: { mode: "sign-in" | "sign-up" }) {
  const copy = productCopy.en.auth;
  const [show, setShow] = useState(false);
  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <div className="auth-brand">
          <span className="brand-mark">
            <span>T</span>
          </span>
          <strong>{trevvBrand.name}</strong>
        </div>
        <div className="auth-promise">
          <span>
            <Sparkles size={17} />
          </span>
          <h1>
            Everything you run.
            <br />
            One clear view.
          </h1>
          <p>
            See what needs attention, why it matters, and who owns the work
            across every business, client, product, and initiative.
          </p>
          <ul>
            <li>
              <Check size={13} />
              Explainable signals from real operational work
            </li>
            <li>
              <Check size={13} />
              Decisions and approvals in context
            </li>
            <li>
              <Check size={13} />
              One calm hierarchy for every Workspace
            </li>
          </ul>
        </div>
        <div className="auth-mini-portfolio">
          <article>
            <span>N</span>
            <div>
              <strong>Northstar Apparel</strong>
              <small>Launch readiness</small>
            </div>
            <b>68%</b>
          </article>
          <article>
            <span>M</span>
            <div>
              <strong>MealFlow</strong>
              <small>Pilot onboarding</small>
            </div>
            <b>Watch</b>
          </article>
          <article>
            <span>L</span>
            <div>
              <strong>LocalReach</strong>
              <small>Service delivery</small>
            </div>
            <b>On track</b>
          </article>
        </div>
      </section>
      <section className="auth-form-panel">
        <div className="auth-form-wrap">
          <span className="auth-kicker">
            <ShieldCheck size={14} />
            Secure workspace access
          </span>
          <h2>{mode === "sign-in" ? copy.signInTitle : copy.signUpTitle}</h2>
          <p>
            {mode === "sign-in" ? copy.signInSubtitle : copy.signUpSubtitle}
          </p>
          <form action="/app/home">
            {mode === "sign-up" && (
              <label>
                {copy.name}
                <span>
                  <UserRound size={15} />
                  <input required placeholder="Mohammed Zaman" />
                </span>
              </label>
            )}
            <label>
              {copy.email}
              <span>
                <Mail size={15} />
                <input
                  type="email"
                  required
                  defaultValue={mode === "sign-in" ? "owner@trevv.local" : ""}
                  placeholder="you@company.com"
                />
              </span>
            </label>
            <label>
              {copy.password}
              <span>
                <LockKeyhole size={15} />
                <input
                  type={show ? "text" : "password"}
                  required
                  defaultValue={mode === "sign-in" ? "trevv-demo" : ""}
                  placeholder="At least 12 characters"
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label="Toggle password visibility"
                >
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </span>
            </label>
            <button className="primary-button" type="submit">
              {mode === "sign-in" ? copy.signIn : copy.create}
              <ArrowRight size={15} />
            </button>
          </form>
          <div className="auth-separator">
            <span>or</span>
          </div>
          <a className="demo-auth-button" href="/app/home">
            <Grid2X2 size={16} />
            {copy.demo}
          </a>
          <p className="auth-switch">
            {mode === "sign-in" ? copy.noAccount : copy.hasAccount}{" "}
            <a href={mode === "sign-in" ? "/sign-up" : "/sign-in"}>
              {mode === "sign-in" ? copy.create : copy.signIn}
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}

export function OnboardingExperience() {
  const copy = productCopy.en.auth;
  const [step, setStep] = useState(1);
  const [managing, setManaging] = useState("businesses");
  const modes = [
    ["businesses", "Multiple businesses / brands", "Operating portfolio"],
    ["clients", "Agency clients", "Client delivery"],
    ["departments", "Company departments", "Department operations"],
    ["products", "Products / initiatives", "Product portfolio"],
    ["personal", "Personal projects", "Personal portfolio"],
    ["blank", "Start blank", "No preset"],
  ] as const;
  return (
    <main className="onboarding-page">
      <header>
        <a href="/sign-in">
          <ChevronLeft size={16} />
          Exit setup
        </a>
        <div className="auth-brand">
          <span className="brand-mark">
            <span>T</span>
          </span>
          <strong>{trevvBrand.name}</strong>
        </div>
        <span>Step {step} of 5</span>
      </header>
      <div className="onboarding-track">
        <i style={{ width: `${step * 20}%` }} />
      </div>
      <section>
        <span className="onboarding-icon">
          <Sparkles size={19} />
        </span>
        <h1>
          {step === 1
            ? "What are you managing?"
            : step === 2
              ? "Create your first Workspace"
              : step === 3
                ? "Choose a starter Blueprint"
                : step === 4
                  ? "Bring your team and context"
                  : "Your Portfolio is ready"}
        </h1>
        <p>
          {step === 1
            ? "This only selects sensible defaults. You can combine different Workspace types later."
            : step === 2
              ? "A Workspace is anything you are responsible for — a business, client, product, department, or initiative."
              : step === 3
                ? "Start with a useful structure or keep the Workspace completely blank."
                : step === 4
                  ? "Invite, connect, or import now — every option can be skipped."
                  : "You can see health, priority, waiting work, and next attention in under five minutes."}
        </p>
        {step === 1 && (
          <div className="onboarding-form onboarding-mode-form">
            <label>
              {copy.organization}
              <input defaultValue="TREVV Demo" />
            </label>
            <div className="managing-grid">
              {modes.map(([value, title, template]) => (
                <label
                  className={managing === value ? "selected" : ""}
                  key={value}
                >
                  <input
                    type="radio"
                    name="managing"
                    value={value}
                    checked={managing === value}
                    onChange={() => setManaging(value)}
                  />
                  <span>{title.at(0)}</span>
                  <strong>{title}</strong>
                  <small>{template}</small>
                </label>
              ))}
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="onboarding-form first-hub-form">
            <label>
              Workspace name
              <input
                defaultValue={
                  managing === "clients" ? "First client" : "Northstar Apparel"
                }
              />
            </label>
            <div>
              <label>
                Type
                <select
                  defaultValue={managing === "clients" ? "client" : "business"}
                >
                  <option value="business">Business</option>
                  <option value="brand">Brand</option>
                  <option value="client">Client</option>
                  <option value="product">Product</option>
                  <option value="department">Department</option>
                  <option value="venture">Venture</option>
                  <option value="initiative">Initiative</option>
                  <option value="project">Project</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                Owner
                <select>
                  <option>Mohammed Zaman</option>
                  <option>Assign later</option>
                </select>
              </label>
            </div>
            <div>
              <label>
                Icon / color
                <div className="hub-identity-input">
                  <span>N</span>
                  <input
                    type="color"
                    defaultValue="#5956c9"
                    aria-label="Workspace color"
                  />
                </div>
              </label>
              <label>
                Health <small>Optional</small>
                <select defaultValue="on_track">
                  <option value="on_track">On Track</option>
                  <option value="watch">Attention</option>
                  <option value="critical">Critical</option>
                  <option value="parked">Paused</option>
                </select>
              </label>
            </div>
            <label>
              Current priority <small>Optional</small>
              <input
                placeholder="What matters most right now?"
                defaultValue="Prepare the first launch review"
              />
            </label>
          </div>
        )}
        {step === 3 && (
          <div className="blueprint-choice-grid">
            {[
              "Operating business",
              "Client delivery",
              "Product initiative",
              "Launch campaign",
              "Start blank",
            ].map((name, index) => (
              <label key={name}>
                <input
                  type="radio"
                  name="blueprint"
                  defaultChecked={index === 0}
                />
                <span>
                  <Grid2X2 size={16} />
                </span>
                <strong>{name}</strong>
                <small>
                  {index === 4
                    ? "No statuses or fields added"
                    : "Board, views, update cadence, and optional review ritual"}
                </small>
              </label>
            ))}
          </div>
        )}
        {step === 4 && (
          <div className="setup-option-grid">
            <label>
              <input type="checkbox" />
              <span>
                <UserRound size={17} />
              </span>
              <strong>Invite team</strong>
              <small>Now or later</small>
            </label>
            <label>
              <input type="checkbox" />
              <span>G</span>
              <strong>Connect Google Drive</strong>
              <small>Permission-safe file picker</small>
            </label>
            <label>
              <input type="checkbox" />
              <span>
                <Grid2X2 size={17} />
              </span>
              <strong>Import spreadsheet</strong>
              <small>Preview and dry run first</small>
            </label>
            <label>
              <input type="checkbox" defaultChecked />
              <span>
                <ShieldCheck size={17} />
              </span>
              <strong>Keep workspace private</strong>
              <small>Recommended default</small>
            </label>
          </div>
        )}
        {step === 5 && (
          <div className="ready-card">
            <span>
              <Check size={20} />
            </span>
            <h2>Your Portfolio is ready</h2>
            <p>
              TREVV created one Portfolio, your first Workspace, a starter
              Blueprint, and a calm Home view. Nothing is locked into a customer
              mode.
            </p>
            <div>
              <b>Venture Portfolio</b>
              <span>1 Workspace · 1 owner · private</span>
            </div>
          </div>
        )}
        <footer>
          <button
            disabled={step === 1}
            onClick={() => setStep((current) => current - 1)}
          >
            {copy.back}
          </button>
          {step < 5 ? (
            <button
              className="primary-button"
              onClick={() => setStep((current) => current + 1)}
            >
              {copy.continue}
              <ArrowRight size={14} />
            </button>
          ) : (
            <a className="primary-button" href="/app/home">
              Open TREVV
              <ArrowRight size={14} />
            </a>
          )}
        </footer>
      </section>
    </main>
  );
}

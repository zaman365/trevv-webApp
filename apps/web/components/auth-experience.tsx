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

export function AuthExperience({ mode }: { mode: "sign-in" | "sign-up" }) {
  const copy = productCopy.en.auth;
  const [show, setShow] = useState(false);
  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <div className="auth-brand">
          <span className="brand-mark">
            <span>F</span>
          </span>
          <strong>{process.env.NEXT_PUBLIC_APP_NAME ?? "FounderHQ"}</strong>
        </div>
        <div className="auth-promise">
          <span>
            <Sparkles size={17} />
          </span>
          <h1>
            Every venture.
            <br />
            One clear next move.
          </h1>
          <p>
            See what needs attention, why it matters, and who owns the work —
            without rebuilding a founder dashboard by hand.
          </p>
          <ul>
            <li>
              <Check size={13} />
              Live Portfolio signals from real work
            </li>
            <li>
              <Check size={13} />
              Decisions and approvals in context
            </li>
            <li>
              <Check size={13} />
              One calm hierarchy for every Hub
            </li>
          </ul>
        </div>
        <div className="auth-mini-portfolio">
          <article>
            <span>Z</span>
            <div>
              <strong>ZEHN</strong>
              <small>Launch readiness</small>
            </div>
            <b>68%</b>
          </article>
          <article>
            <span>L</span>
            <div>
              <strong>Leckereich</strong>
              <small>Pilot onboarding</small>
            </div>
            <b>Watch</b>
          </article>
          <article>
            <span>M</span>
            <div>
              <strong>MarktFix</strong>
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
          <form action="/app/portfolio">
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
                  defaultValue={
                    mode === "sign-in" ? "owner@founderhq.local" : ""
                  }
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
                  defaultValue={mode === "sign-in" ? "founderhq-demo" : ""}
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
          <a className="demo-auth-button" href="/app/portfolio">
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
  const starterHubs = ["ZEHN", "Leckereich", "MarktFix", "Shared operations"];
  return (
    <main className="onboarding-page">
      <header>
        <a href="/sign-in">
          <ChevronLeft size={16} />
          Exit setup
        </a>
        <div className="auth-brand">
          <span className="brand-mark">
            <span>F</span>
          </span>
          <strong>FounderHQ</strong>
        </div>
        <span>Step {step} of 4</span>
      </header>
      <div className="onboarding-track">
        <i style={{ width: `${step * 25}%` }} />
      </div>
      <section>
        <span className="onboarding-icon">
          <Sparkles size={19} />
        </span>
        <h1>{copy.onboardingTitle}</h1>
        <p>{copy.onboardingSubtitle}</p>
        {step === 1 && (
          <div className="onboarding-form">
            <label>
              {copy.organization}
              <input defaultValue="FounderHQ Demo" />
            </label>
            <div>
              <label>
                {copy.language}
                <select defaultValue="en">
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                </select>
              </label>
              <label>
                {copy.timezone}
                <select defaultValue="Europe/Berlin">
                  <option>Europe/Berlin</option>
                  <option>UTC</option>
                </select>
              </label>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="hub-choice-grid">
            {starterHubs.map((hub, index) => (
              <label key={hub}>
                <input type="checkbox" defaultChecked={index < 3} />
                <span>{hub.at(0)}</span>
                <strong>{hub}</strong>
                <small>{index === 3 ? "Shared function" : "Venture Hub"}</small>
              </label>
            ))}
          </div>
        )}
        {step === 3 && (
          <div className="onboarding-form">
            <label>
              {copy.invite} <small>{copy.optional}</small>
              <textarea placeholder="teammate@company.com" />
            </label>
            <p>Guests will only see the Hubs explicitly shared with them.</p>
          </div>
        )}
        {step === 4 && (
          <div className="ready-card">
            <span>
              <Check size={20} />
            </span>
            <h2>Your Portfolio is ready</h2>
            <p>
              We added realistic starter work so you can understand the
              operating rhythm before replacing it with your own.
            </p>
          </div>
        )}
        <footer>
          <button
            disabled={step === 1}
            onClick={() => setStep((current) => current - 1)}
          >
            {copy.back}
          </button>
          {step < 4 ? (
            <button
              className="primary-button"
              onClick={() => setStep((current) => current + 1)}
            >
              {copy.continue}
              <ArrowRight size={14} />
            </button>
          ) : (
            <a className="primary-button" href="/app/portfolio">
              Open Portfolio
              <ArrowRight size={14} />
            </a>
          )}
        </footer>
      </section>
    </main>
  );
}

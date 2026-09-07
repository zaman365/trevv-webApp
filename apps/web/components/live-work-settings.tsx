"use client";

import type { ComponentProps } from "react";

import {
  Bot,
  CreditCard,
  FileArchive,
  PlugZap,
  ShieldCheck,
} from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import { useReportRouteReady } from "@/lib/navigation-performance";
import { LiveWorkspaceSettings } from "./live-workspace-settings";
import styles from "./live-operating-loop.module.css";

const privateBetaFoundationStatus = [
  {
    icon: PlugZap,
    title: "External integrations",
    status: "Disabled · no pilot approval",
    description:
      "No production OAuth credential, webhook, synchronization, or provider write is active. There is no provider connection to recover or revoke.",
  },
  {
    icon: FileArchive,
    title: "Import and private files",
    status: "Disabled · workflow not approved",
    description:
      "Live CSV import and uploads are unavailable. TREVV stores no uploaded file and issues no signed download URL.",
  },
  {
    icon: Bot,
    title: "Automation and AI",
    status: "Disabled · no runtime adapter",
    description:
      "No model or external-effect executor is configured. Deterministic product rules remain internal.",
  },
  {
    icon: CreditCard,
    title: "Billing",
    status: "Disabled · pricing unapproved",
    description:
      "No commercial price, checkout, payment method, subscription webhook, or paid entitlement is active.",
  },
] as const;

function PrivateBetaSettingsStatus() {
  return (
    <section
      className={styles.panel}
      aria-labelledby="private-beta-foundations-title"
      data-testid="private-beta-foundations"
    >
      <header>
        <div>
          <p>Evidence-gated capabilities</p>
          <h2 id="private-beta-foundations-title">
            Private-beta safety status
          </h2>
        </div>
        <span className={styles.foundationStatus}>
          External capabilities unavailable
        </span>
      </header>
      <div className={styles.foundationGrid}>
        {privateBetaFoundationStatus.map((item) => {
          const Icon = item.icon;
          return (
            <article className={styles.foundationCard} key={item.title}>
              <span className={styles.rowIcon} aria-hidden="true">
                <Icon size={17} />
              </span>
              <div>
                <span className={styles.foundationStatus}>{item.status}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </article>
          );
        })}
      </div>
      <div className={styles.foundationLinks}>
        <ShieldCheck size={17} aria-hidden="true" />
        <span>Account and data controls remain available independently.</span>
        <Link href="/app/account/sessions">Sessions</Link>
        <Link href="/app/account/privacy">Privacy center</Link>
        <Link href="/terms">Terms</Link>
      </div>
    </section>
  );
}

export function LiveSettingsFeature({
  workspace,
}: {
  workspace: ComponentProps<typeof LiveWorkspaceSettings>["workspace"];
}) {
  useReportRouteReady(true);
  return (
    <>
      <LiveWorkspaceSettings workspace={workspace} />
      <PrivateBetaSettingsStatus />
    </>
  );
}

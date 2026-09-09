"use client";

import {
  Activity,
  Building2,
  Fingerprint,
  History,
  LayoutDashboard,
  LogOut,
  Mail,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { SuperadminSession } from "@founderhq/api-contract";
import { superadminRequest } from "@/lib/superadmin-client";
import styles from "./superadmin.module.css";

export function SuperadminShell({
  session,
  section,
  children,
}: {
  session: SuperadminSession;
  section: string;
  children: ReactNode;
}) {
  const [message, setMessage] = useState("");
  const navigation = [
    {
      id: "overview",
      label: "Overview",
      icon: LayoutDashboard,
      href: "/superadmin",
    },
    {
      id: "organizations",
      label: "Organisations",
      icon: Building2,
      href: "/superadmin/organizations",
    },
    { id: "people", label: "People", icon: Users, href: "/superadmin/people" },
    {
      id: "invitations",
      label: "Invitations",
      icon: Mail,
      href: "/superadmin/invitations",
    },
    ...(session.role === "owner"
      ? [
          {
            id: "administrators",
            label: "Administrators",
            icon: Shield,
            href: "/superadmin/administrators",
          },
        ]
      : []),
    {
      id: "audit",
      label: "Audit trail",
      icon: History,
      href: "/superadmin/audit",
    },
    {
      id: "security",
      label: "My security",
      icon: Fingerprint,
      href: "/superadmin/security",
    },
  ];
  async function signOut() {
    try {
      await superadminRequest("/auth/sign-out", {});
      window.location.replace("/superadmin/sign-in");
    } catch {
      setMessage("Sign-out was not confirmed. Try again.");
    }
  }
  return (
    <div className={`${styles.root} ${styles.shell}`}>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/superadmin" prefetch={false}>
          <span>T</span> TREVV <small>CONTROL</small>
        </Link>
        <p className={styles.sidebarCaption}>PLATFORM</p>
        <nav className={styles.nav} aria-label="Platform administration">
          {navigation.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              prefetch={false}
              aria-current={section === item.id ? "page" : undefined}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.sidebarFoot}>
          <div>
            <strong>{session.name}</strong>
            <span>
              {session.role === "owner"
                ? "Platform owner"
                : `Platform ${session.role}`}
            </span>
          </div>
          <button className={styles.textButton} onClick={() => void signOut()}>
            <LogOut size={16} /> Sign out
          </button>
          {message && <p role="status">{message}</p>}
        </div>
      </aside>
      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <span>
            <ShieldCheck size={17} /> Private administration
          </span>
          <span>
            <Activity size={15} />{" "}
            <span className={styles.role}>{session.role}</span>
          </span>
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}

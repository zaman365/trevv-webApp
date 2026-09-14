"use client";

import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { prepareWorkspaceLogo } from "@/lib/workspace-logo";
import { WorkspaceMark } from "./workspace-mark";
import styles from "./workspace-logo-field.module.css";

export function WorkspaceLogoField({
  icon,
  accent,
  currentUrl,
  value,
  disabled,
  onChange,
  onProcessing,
}: {
  icon: string;
  accent: string;
  currentUrl?: string | undefined;
  value: string | null | undefined;
  disabled: boolean;
  onChange(value: string | null | undefined): void;
  onProcessing(processing: boolean): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const logoUrl = value === undefined ? currentUrl : (value ?? undefined);
  async function select(file: File | undefined) {
    if (!file) return;
    setError("");
    setProcessing(true);
    onProcessing(true);
    try {
      onChange(await prepareWorkspaceLogo(file));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The image could not be opened.",
      );
    } finally {
      setProcessing(false);
      onProcessing(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <section className={styles.field} aria-label="Workspace logo">
      <span
        className={styles.preview}
        style={{ color: accent, background: `${accent}12` }}
      >
        <WorkspaceMark workspace={{ icon, ...(logoUrl ? { logoUrl } : {}) }} />
      </span>
      <div className={styles.content}>
        <strong>Workspace logo</strong>
        <p>
          PNG, JPG, WebP, GIF or AVIF · up to 10 MB. Your image is fitted
          without cropping. Animated images use a still frame.
        </p>
        <div className={styles.actions}>
          <input
            ref={input}
            className="sr-only"
            tabIndex={-1}
            type="file"
            aria-label="Choose workspace logo"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif,.png,.jpg,.jpeg,.webp,.gif,.avif"
            disabled={disabled || processing}
            onChange={(event) => void select(event.currentTarget.files?.[0])}
          />
          <button
            type="button"
            disabled={disabled || processing}
            onClick={() => input.current?.click()}
          >
            <Upload size={16} />
            {processing
              ? "Preparing image…"
              : logoUrl
                ? "Replace logo"
                : "Upload logo"}
          </button>
          {logoUrl ? (
            <button
              type="button"
              disabled={disabled || processing}
              onClick={() => {
                setError("");
                onChange(null);
              }}
            >
              <X size={16} />
              Remove logo
            </button>
          ) : null}
          {value !== undefined ? (
            <button
              type="button"
              disabled={disabled || processing}
              onClick={() => {
                setError("");
                onChange(undefined);
              }}
            >
              Undo logo change
            </button>
          ) : null}
        </div>
        <small>
          {value !== undefined
            ? "Save Workspace settings to apply this change."
            : "Shown in workspace navigation and cards. The short mark is used when no logo is set."}
        </small>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

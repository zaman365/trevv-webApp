import {
  capabilityStatusLabel,
  getProductCapability,
  productPreview,
  type ProductCapabilityKey,
} from "@/lib/product-capabilities";
import styles from "./capability-status.module.css";

export function TechnicalPreviewBadge() {
  return (
    <span
      className={styles.previewBadge}
      aria-label={productPreview.conciseLabel}
      title={productPreview.conciseLabel}
    >
      <span className={styles.previewBadgeDot} aria-hidden="true" />
      <span className={styles.previewBadgeText}>
        <strong>{productPreview.stage}</strong>
        <small>Fictional data · browser-only</small>
      </span>
    </span>
  );
}

export function CapabilityNotice({
  capability,
}: {
  capability: ProductCapabilityKey;
}) {
  const entry = getProductCapability(capability);

  return (
    <aside
      className={styles.notice}
      data-capability={capability}
      data-capability-status={entry.status}
      aria-label={`${capabilityStatusLabel[entry.status]} capability: ${entry.title}`}
    >
      <span className={styles.noticeDot} aria-hidden="true" />
      <span className={styles.noticeCopy}>
        <span className={styles.noticeMeta}>
          {capabilityStatusLabel[entry.status]}
        </span>
        <strong className={styles.noticeTitle}>{entry.title}</strong>
        <span className={styles.noticeDescription}>{entry.description}</span>
      </span>
    </aside>
  );
}

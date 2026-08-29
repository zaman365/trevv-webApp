import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./legal-preview-notice.module.css";

export function LegalPreviewNotice({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <article className={styles.notice}>
        <header>
          <Link className={styles.brand} href="/">
            TREVV
          </Link>
          <p className={styles.status}>Draft · legal review pending</p>
          <h1>{title}</h1>
          <p className={styles.lede}>
            This engineering notice describes the fictional-data technical
            preview. It is not a reviewed legal agreement and is not approval to
            enter real customer data.
          </p>
        </header>
        <div className={styles.content}>{children}</div>
        <footer>
          <Link href="/privacy">Privacy preview</Link>
          <Link href="/terms">Terms preview</Link>
          <Link href="/sign-in">Return to sign in</Link>
        </footer>
      </article>
    </main>
  );
}

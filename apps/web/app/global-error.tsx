"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-error-reporting";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientError("root-render", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          alignItems: "center",
          background: "#f6f7fb",
          color: "#202536",
          display: "flex",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          justifyContent: "center",
          margin: 0,
          minHeight: "100vh",
          padding: "24px",
        }}
      >
        <main
          style={{
            background: "white",
            border: "1px solid #dfe3ec",
            borderRadius: "16px",
            maxWidth: "560px",
            padding: "24px",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", marginTop: 0 }}>
            TREVV could not start
          </h1>
          <p style={{ color: "#5f687c", lineHeight: 1.55 }}>
            No operation was confirmed. Try loading the application again.
            {error.digest ? ` Reference: ${error.digest}.` : ""}
          </p>
          <button
            type="button"
            onClick={retry}
            style={{
              background: "#5148c8",
              border: 0,
              borderRadius: "9px",
              color: "white",
              cursor: "pointer",
              font: "inherit",
              fontWeight: 700,
              padding: "10px 14px",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}

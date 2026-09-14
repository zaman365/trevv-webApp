"use client";

import { useState } from "react";

/** Reuses the surrounding mark's size, colour and shape on every surface. */
export function WorkspaceMark({
  workspace,
}: {
  workspace: { icon: string; logoUrl?: string | undefined };
}) {
  const [failedUrl, setFailedUrl] = useState<string | undefined>();
  if (!workspace.logoUrl || failedUrl === workspace.logoUrl)
    return <>{workspace.icon}</>;
  return (
    // Authenticated brand images need the browser session, without an image proxy.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={workspace.logoUrl}
      alt=""
      draggable={false}
      onError={() => setFailedUrl(workspace.logoUrl)}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "contain",
        borderRadius: "inherit",
      }}
    />
  );
}

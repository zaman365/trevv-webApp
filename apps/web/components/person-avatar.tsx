"use client";

import { useState } from "react";
import { initials } from "@/lib/team-workspace";

export function PersonAvatar({
  name,
  url,
  className,
}: {
  name: string;
  url?: string | undefined;
  className?: string | undefined;
}) {
  const [failed, setFailed] = useState<string>();
  let safe = false;
  try {
    const parsed = new URL(url ?? "");
    safe = parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {}
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{ overflow: "hidden" }}
    >
      {safe && failed !== url ? (
        // User-provided photos load in the browser; the server never fetches an
        // arbitrary profile URL. Initials remain available for broken images.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(url)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}

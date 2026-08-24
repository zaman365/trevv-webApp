export type ProviderKey =
  | "google_drive"
  | "figma"
  | "github"
  | "canva"
  | "google_docs"
  | "slack"
  | "shopify"
  | "generic";

export interface ExternalResource {
  provider: ProviderKey;
  providerId?: string;
  name: string;
  url: string;
  mimeType?: string;
  thumbnailUrl?: string;
  ownerName?: string;
  modifiedAt?: string;
}

export interface ResourceProvider {
  readonly key: ProviderKey;
  connect(state: string): Promise<{ authorizationUrl: string }>;
  disconnect(connectionId: string): Promise<void>;
  verifyWebhook(headers: Headers, body: Uint8Array): Promise<boolean>;
}

const providerHosts: ReadonlyArray<[ProviderKey, RegExp]> = [
  ["figma", /(^|\.)figma\.com$/i],
  ["github", /(^|\.)github\.com$/i],
  ["canva", /(^|\.)canva\.com$/i],
  ["google_docs", /(^|\.)docs\.google\.com$/i],
  ["slack", /(^|\.)slack\.com$/i],
  ["shopify", /(^|\.)shopify\.com$/i],
];

export function parseSmartLink(input: string): ExternalResource | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:") return null;
    const provider =
      providerHosts.find(([, host]) => host.test(url.hostname))?.[0] ??
      "generic";
    return { provider, name: titleFromPath(url), url: url.toString() };
  } catch {
    return null;
  }
}

function titleFromPath(url: URL): string {
  const meaningful = url.pathname
    .split("/")
    .filter(Boolean)
    .slice(-2)
    .join(" / ")
    .replace(/[-_]/g, " ");
  return meaningful || url.hostname;
}

export const disconnectedProvider = (key: ProviderKey): ResourceProvider => ({
  key,
  connect: async () => {
    throw new Error(`${key} is not configured.`);
  },
  disconnect: async () => undefined,
  verifyWebhook: async () => false,
});

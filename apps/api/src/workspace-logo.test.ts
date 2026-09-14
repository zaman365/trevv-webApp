import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { normalizeWorkspaceLogo } from "./workspace-logo";

describe("workspace logo decoding", () => {
  it.each(["png", "jpeg", "webp"] as const)(
    "fits %s pixels and strips metadata into a stable static logo",
    async (format) => {
      const source = await sharp({
        create: { width: 800, height: 400, channels: 4, background: "#635bff" },
      })
        .toFormat(format)
        .toBuffer();
      const input = `data:image/${format};base64,${source.toString("base64")}`;
      const first = await normalizeWorkspaceLogo(input);
      expect(await normalizeWorkspaceLogo(input)).toEqual(first);
      const saved = await sharp(Buffer.from(first.data, "base64")).metadata();
      expect(saved).toMatchObject({ format: "webp", width: 512, height: 256 });
      expect(saved.exif).toBeUndefined();
      expect(first.version).toMatch(/^[a-f0-9]{64}$/);
    },
  );
  it.each([
    "data:image/png;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+",
    "data:image/svg+xml;base64,PHN2Zy8+",
    "data:image/png;base64,aGVsbG8=",
    "data:image/png;base64," + "A".repeat(120_000),
  ])("rejects malformed, disguised or oversized content", async (input) => {
    await expect(normalizeWorkspaceLogo(input)).rejects.toMatchObject({
      code: "invalid_input",
    });
  });
  it("rejects images with excessive decoded dimensions", async () => {
    const bytes = await sharp({
      create: { width: 1100, height: 1100, channels: 4, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    await expect(
      normalizeWorkspaceLogo(
        `data:image/png;base64,${bytes.toString("base64")}`,
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});

it("reads logos only through an authorized workspace and organization scope", async () => {
  const { createPostgresAdapter } = await import("./postgres-adapter");
  const { vi } = await import("vitest");
  const getLogo = vi
    .fn()
    .mockResolvedValue({ data: "aW1hZ2U=", version: "a".repeat(64) });
  const forOrganization = vi.fn().mockReturnValue({ workspaces: { getLogo } });
  const { dataPlane } = createPostgresAdapter({
    repositories: {
      forOrganization,
    } as unknown as import("@founderhq/db").PostgresRepositories,
    resolveIdentity: async () => null,
  });
  const context: import("./data-plane").ApiRequestContext = {
    access: {
      userId: "reader",
      organizationId: "org-one",
      role: "member",
      accessiblePortfolioIds: new Set(),
      managedPortfolioIds: new Set(),
      accessibleWorkspaceIds: new Set(["visible"]),
      managedWorkspaceIds: new Set(),
    },
    requestId: "logo-read",
    now: new Date(),
    newId: () => "unused",
  };
  await expect(dataPlane.getWorkspaceLogo(context, "hidden")).rejects.toThrow();
  expect(getLogo).not.toHaveBeenCalled();
  expect(forOrganization).not.toHaveBeenCalled();
  await expect(dataPlane.getWorkspaceLogo(context, "visible")).resolves.toEqual(
    { data: "aW1hZ2U=", version: "a".repeat(64) },
  );
  expect(forOrganization).toHaveBeenCalledWith(
    expect.objectContaining({ organizationId: "org-one", userId: "reader" }),
  );
  expect(getLogo).toHaveBeenCalledWith("visible");
  getLogo.mockResolvedValueOnce(null);
  await expect(
    dataPlane.getWorkspaceLogo(context, "visible"),
  ).rejects.toMatchObject({ code: "resource_not_found" });
});

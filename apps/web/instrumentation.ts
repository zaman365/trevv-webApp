export async function register() {
  const { validateProductionWebConfiguration } =
    await import("./lib/web-runtime-config");
  validateProductionWebConfiguration();
}

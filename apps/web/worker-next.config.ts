import nextConfig from "./next.config";

// Workers use the Cloudflare bundle. Retain every shared Next setting, including
// security headers, while reserving Node standalone packaging for next build.
const workerNextConfig: Omit<typeof nextConfig, "output"> & {
  output?: typeof nextConfig.output;
} = { ...nextConfig };
delete workerNextConfig.output;

export default workerNextConfig;

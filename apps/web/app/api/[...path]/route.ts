import { proxyApiRequest } from "@/lib/api-proxy";

type ApiRouteContext = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: ApiRouteContext) {
  const { path } = await context.params;
  return proxyApiRequest(request, path);
}

export const dynamic = "force-dynamic";

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;

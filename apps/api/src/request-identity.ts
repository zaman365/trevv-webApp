import type {
  AuthIdentityResolver,
  ResolvedAuthIdentity,
} from "@founderhq/auth-server";

/** Share authentication work only within the identical incoming Request object. */
export function requestLocalIdentityResolver(
  resolver: AuthIdentityResolver,
): AuthIdentityResolver {
  const pending = new WeakMap<Request, Promise<ResolvedAuthIdentity | null>>();
  return {
    resolve(request) {
      let result = pending.get(request);
      if (!result) {
        result = Promise.resolve().then(() => resolver.resolve(request));
        pending.set(request, result);
      }
      return result;
    },
  };
}

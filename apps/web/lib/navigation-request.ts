// Flight's RSC header is hidden from headers() by both supported runtimes.
// The proxy normalizes this marker before layouts read it. It never authorizes.
export const clientNavigationHeader = "x-trevv-client-navigation";

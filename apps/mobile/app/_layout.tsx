import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: "700" as const },
          contentStyle: { backgroundColor: "#f5f6fa" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Portfolio" }} />
        <Stack.Screen name="hubs/[slug]" options={{ title: "Project" }} />
      </Stack>
    </QueryClientProvider>
  );
}

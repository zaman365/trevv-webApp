import { createApiClient } from "@founderhq/api-client";
import { nativeTheme } from "@founderhq/ui-native";
import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const api = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787/api/v1",
});

export default function PortfolioScreen() {
  const portfolio = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.portfolio(),
  });
  if (portfolio.isLoading)
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={nativeTheme.colors.primary} />
        <Text style={styles.loading}>Loading your Portfolio…</Text>
      </SafeAreaView>
    );
  if (portfolio.isError || !portfolio.data)
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorTitle}>TREVV is offline</Text>
        <Text style={styles.errorText}>
          Start the API or check EXPO_PUBLIC_API_URL, then retry.
        </Text>
        <Pressable
          style={styles.retry}
          onPress={() => void portfolio.refetch()}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </SafeAreaView>
    );
  const signals = portfolio.data.signals;
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={portfolio.isFetching}
            onRefresh={() => void portfolio.refetch()}
          />
        }
      >
        <Text style={styles.eyebrow}>TREVV · MOBILE COMPANION</Text>
        <Text style={styles.title}>Portfolio</Text>
        <Text style={styles.subtitle}>
          Review what needs you without carrying the desktop board in your
          pocket.
        </Text>
        <View style={styles.attention}>
          <View>
            <Text style={styles.attentionCount}>
              {signals.decisions + signals.approvals + signals.blocked}
            </Text>
            <Text style={styles.attentionLabel}>signals need attention</Text>
          </View>
          <View style={styles.signalPills}>
            <Text style={styles.signalPill}>{signals.decisions} decisions</Text>
            <Text style={styles.signalPill}>{signals.approvals} approvals</Text>
            <Text style={[styles.signalPill, styles.dangerPill]}>
              {signals.blocked} blocked
            </Text>
          </View>
        </View>
        <Text style={styles.sectionTitle}>Hubs</Text>
        {portfolio.data.hubs.map(({ hub, rollup }) => (
          <Pressable
            key={hub.id}
            style={styles.hubCard}
            onPress={() =>
              router.push({
                pathname: "/hubs/[slug]",
                params: { slug: hub.slug },
              })
            }
          >
            <View
              style={[styles.hubIcon, { backgroundColor: `${hub.accent}1a` }]}
            >
              <Text style={[styles.hubIconText, { color: hub.accent }]}>
                {hub.icon}
              </Text>
            </View>
            <View style={styles.hubBody}>
              <View style={styles.hubTitleRow}>
                <Text style={styles.hubName}>{hub.name}</Text>
                <Text
                  style={[
                    styles.health,
                    hub.health === "critical"
                      ? styles.healthCritical
                      : hub.health === "watch"
                        ? styles.healthWatch
                        : styles.healthGood,
                  ]}
                >
                  {hub.health.replace("_", " ")}
                </Text>
              </View>
              <Text style={styles.priority}>{hub.priority}</Text>
              <View style={styles.hubMeta}>
                <Text>{rollup.open} open</Text>
                <Text>{rollup.blocked} blocked</Text>
                <Text>
                  {rollup.decisions + rollup.approvals} need attention
                </Text>
              </View>
            </View>
          </Pressable>
        ))}
        <Text style={styles.buildInfo}>
          Shell {Constants.expoConfig?.version ?? "0.1"} · Shared API contracts
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: nativeTheme.colors.canvas },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    backgroundColor: nativeTheme.colors.canvas,
  },
  content: { padding: 18, paddingBottom: 40 },
  loading: { marginTop: 10, color: nativeTheme.colors.muted },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: nativeTheme.colors.ink,
  },
  errorText: {
    marginTop: 8,
    color: nativeTheme.colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  retry: {
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 11,
    backgroundColor: nativeTheme.colors.primary,
  },
  retryText: { color: "white", fontWeight: "700" },
  eyebrow: {
    color: nativeTheme.colors.primary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: {
    marginTop: 8,
    color: nativeTheme.colors.ink,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -1,
  },
  subtitle: {
    marginTop: 7,
    color: nativeTheme.colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  attention: {
    marginTop: 22,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e2e5ec",
  },
  attentionCount: {
    color: nativeTheme.colors.ink,
    fontSize: 30,
    fontWeight: "800",
  },
  attentionLabel: { color: nativeTheme.colors.muted, fontSize: 12 },
  signalPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 12,
  },
  signalPill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    color: nativeTheme.colors.primary,
    backgroundColor: "#eeeeff",
    fontSize: 10,
    fontWeight: "700",
  },
  dangerPill: { color: nativeTheme.colors.danger, backgroundColor: "#ffebee" },
  sectionTitle: {
    marginTop: 24,
    marginBottom: 10,
    color: nativeTheme.colors.ink,
    fontSize: 16,
    fontWeight: "800",
  },
  hubCard: {
    flexDirection: "row",
    gap: 11,
    marginBottom: 9,
    padding: 13,
    borderRadius: 16,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e2e5ec",
  },
  hubIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  hubIconText: { fontWeight: "800" },
  hubBody: { flex: 1 },
  hubTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hubName: { color: nativeTheme.colors.ink, fontSize: 14, fontWeight: "800" },
  health: {
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  healthCritical: {
    color: nativeTheme.colors.danger,
    backgroundColor: "#ffebee",
  },
  healthWatch: {
    color: nativeTheme.colors.warning,
    backgroundColor: "#fff3dc",
  },
  healthGood: { color: nativeTheme.colors.success, backgroundColor: "#e7f5ef" },
  priority: { marginTop: 5, color: nativeTheme.colors.muted, fontSize: 11 },
  hubMeta: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  buildInfo: {
    marginTop: 20,
    color: nativeTheme.colors.muted,
    fontSize: 10,
    textAlign: "center",
  },
});

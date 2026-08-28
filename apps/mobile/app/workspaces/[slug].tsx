import { createApiClient } from "@founderhq/api-client";
import { nativeTheme } from "@founderhq/ui-native";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const api = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787/api/v1",
});
export default function WorkspaceScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const workspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => api.workspaces(),
  });
  const workspace = workspaces.data?.find(
    (candidate) => candidate.slug === slug,
  );
  if (!workspace)
    return (
      <SafeAreaView style={styles.center}>
        {workspaces.isLoading ? (
          <ActivityIndicator color={nativeTheme.colors.primary} />
        ) : (
          <Text>Project unavailable.</Text>
        )}
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View
          style={[styles.icon, { backgroundColor: `${workspace.accent}1a` }]}
        >
          <Text
            style={{ color: workspace.accent, fontWeight: "800", fontSize: 18 }}
          >
            {workspace.icon}
          </Text>
        </View>
        <Text style={styles.title}>{workspace.name}</Text>
        <Text style={styles.stage}>
          {workspace.stage} · {workspace.health.replace("_", " ")}
        </Text>
        <View style={styles.card}>
          <Text style={styles.label}>CURRENT PRIORITY</Text>
          <Text style={styles.value}>{workspace.priority}</Text>
          <Text style={styles.note}>{workspace.healthNote}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>NEXT MILESTONE</Text>
          <Text style={styles.value}>{workspace.nextMilestone.title}</Text>
          <Text style={styles.note}>{workspace.nextMilestone.date}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>LATEST UPDATE</Text>
          <Text style={styles.note}>{workspace.latestUpdate.text}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: nativeTheme.colors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20 },
  icon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  title: {
    marginTop: 14,
    color: nativeTheme.colors.ink,
    fontSize: 30,
    fontWeight: "800",
  },
  stage: {
    marginTop: 4,
    color: nativeTheme.colors.muted,
    fontSize: 12,
    textTransform: "capitalize",
  },
  card: {
    marginTop: 14,
    padding: 16,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e2e5ec",
    borderRadius: 16,
  },
  label: {
    color: nativeTheme.colors.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  value: {
    marginTop: 7,
    color: nativeTheme.colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  note: {
    marginTop: 8,
    color: nativeTheme.colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
});

import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  CONNECTION_STORAGE_KEY,
  createConnectionRecord,
  normalizeBaseUrl,
  type MobileConnectionRecord,
} from "./src/connections";

function sortConnections(connections: ReadonlyArray<MobileConnectionRecord>): Array<MobileConnectionRecord> {
  return [...connections].toSorted((left, right) => left.environment.label.localeCompare(right.environment.label));
}

export default function App() {
  const [connections, setConnections] = useState<Array<MobileConnectionRecord>>([]);
  const [hydrating, setHydrating] = useState(true);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const [httpBaseUrl, setHttpBaseUrl] = useState("");
  const [wsBaseUrl, setWsBaseUrl] = useState("");

  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      try {
        const raw = await AsyncStorage.getItem(CONNECTION_STORAGE_KEY);
        if (!mounted || !raw) {
          return;
        }

        const parsed = JSON.parse(raw) as Array<MobileConnectionRecord>;
        setConnections(sortConnections(parsed));
      } catch (error) {
        console.error("Failed to load connections", error);
      } finally {
        if (mounted) {
          setHydrating(false);
        }
      }
    };

    hydrate();
    return () => {
      mounted = false;
    };
  }, []);

  const persistConnections = useCallback(async (next: Array<MobileConnectionRecord>) => {
    const sorted = sortConnections(next);
    setConnections(sorted);
    await AsyncStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify(sorted));
  }, []);

  const onSave = useCallback(async () => {
    setSaving(true);
    try {
      const normalizedHttp = normalizeBaseUrl(httpBaseUrl, "http");
      const normalizedWs = normalizeBaseUrl(wsBaseUrl || normalizedHttp, "ws");

      const nextRecord = await createConnectionRecord({
        label,
        httpBaseUrl: normalizedHttp,
        wsBaseUrl: normalizedWs,
      });

      await persistConnections(
        connections.filter(
          (connection) => connection.environment.id !== nextRecord.environment.id,
        ).concat(nextRecord),
      );

      setLabel("");
      setHttpBaseUrl("");
      setWsBaseUrl("");
    } catch (error) {
      Alert.alert("Could not add connection", (error as Error).message);
    } finally {
      setSaving(false);
    }
  }, [connections, httpBaseUrl, label, persistConnections, wsBaseUrl]);

  const removeConnection = useCallback(
    async (environmentId: string) => {
      const nextConnections = connections.filter(
        (connection) => connection.environment.id !== environmentId,
      );
      await persistConnections(nextConnections);
    },
    [connections, persistConnections],
  );

  const connectionCountLabel = useMemo(() => {
    if (connections.length === 1) {
      return "1 saved connection";
    }
    return `${connections.length} saved connections`;
  }, [connections.length]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <Text style={styles.title}>T3 Code for iPad</Text>
        <Text style={styles.subtitle}>
          Add remote T3 Code backends running on your computers. No local server is started on mobile.
        </Text>

        <View style={styles.form}>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="Connection name (optional)"
            style={styles.input}
            placeholderTextColor="#64748b"
          />
          <TextInput
            value={httpBaseUrl}
            onChangeText={setHttpBaseUrl}
            placeholder="HTTP URL (for example http://192.168.1.12:13773)"
            style={styles.input}
            placeholderTextColor="#64748b"
            autoCapitalize="none"
          />
          <TextInput
            value={wsBaseUrl}
            onChangeText={setWsBaseUrl}
            placeholder="WebSocket URL (optional, defaults to HTTP host)"
            style={styles.input}
            placeholderTextColor="#64748b"
            autoCapitalize="none"
          />
          <Pressable onPress={onSave} style={styles.primaryButton} disabled={saving}>
            {saving ? <ActivityIndicator color="#020617" /> : <Text style={styles.primaryButtonText}>Validate and Save</Text>}
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>{connectionCountLabel}</Text>

        {hydrating ? (
          <ActivityIndicator color="#e2e8f0" />
        ) : (
          <FlatList
            data={connections}
            keyExtractor={(item) => item.environment.id}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{item.environment.label}</Text>
                  <Pressable
                    onPress={() => removeConnection(item.environment.id)}
                    style={styles.removeButton}
                  >
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </Pressable>
                </View>
                <Text style={styles.cardBody}>HTTP: {item.environment.target.httpBaseUrl}</Text>
                <Text style={styles.cardBody}>WS: {item.environment.target.wsBaseUrl}</Text>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No remote connections saved yet.</Text>}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#020617",
  },
  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 20,
    gap: 16,
  },
  title: {
    color: "#f8fafc",
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: 20,
  },
  sectionTitle: {
    color: "#e2e8f0",
    fontWeight: "600",
    fontSize: 15,
  },
  form: {
    gap: 8,
  },
  input: {
    backgroundColor: "#0f172a",
    borderColor: "#1e293b",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#e2e8f0",
  },
  primaryButton: {
    backgroundColor: "#7dd3fc",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#020617",
    fontWeight: "700",
  },
  separator: {
    height: 10,
  },
  card: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    borderColor: "#1e293b",
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  cardTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "600",
    flexShrink: 1,
  },
  cardBody: {
    color: "#cbd5e1",
    fontSize: 13,
  },
  removeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#1e293b",
  },
  removeButtonText: {
    color: "#fca5a5",
    fontWeight: "600",
  },
  emptyText: {
    color: "#94a3b8",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 24,
  },
});

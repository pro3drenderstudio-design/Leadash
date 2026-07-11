import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList } from "react-native";
import { getWorkspaces, WorkspaceSummary } from "../lib/api";
import { setWorkspaceId } from "../lib/workspace";
import { C, FONT } from "../theme/tokens";
import { Card, Skeleton, ErrorState, Btn, Avatar } from "../components/ui";
import { supabase } from "../lib/supabase";

export default function WorkspacePickerScreen({ onPicked }: { onPicked: () => void }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setWorkspaces(null);
    try {
      const { workspaces: list } = await getWorkspaces();
      if (list.length === 1) {
        await setWorkspaceId(list[0].id);
        onPicked();
        return;
      }
      setWorkspaces(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load workspaces");
    }
  }, [onPicked]);

  useEffect(() => { load(); }, [load]);

  async function pick(ws: WorkspaceSummary) {
    await setWorkspaceId(ws.id);
    onPicked();
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center" }}>
        <ErrorState message={error} onRetry={load} />
        <Btn label="Sign out" variant="ghost" onPress={() => supabase.auth.signOut()} style={{ alignSelf: "center" }} />
      </View>
    );
  }

  if (!workspaces) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, padding: 20, justifyContent: "center", gap: 10 }}>
        {[1, 2, 3].map(i => <Skeleton key={i} height={64} />)}
      </View>
    );
  }

  if (workspaces.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center", padding: 24 }}>
        <Text style={{ color: C.text, fontSize: 16, fontFamily: FONT.semibold, textAlign: "center" }}>
          No workspace yet
        </Text>
        <Text style={{ color: C.textQuiet, fontSize: 13, fontFamily: FONT.regular, textAlign: "center", marginTop: 8 }}>
          Create your workspace at leadash.com first, then sign in here.
        </Text>
        <Btn label="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} style={{ marginTop: 20, alignSelf: "center", paddingHorizontal: 32 }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 20, justifyContent: "center" }}>
      <Text style={{ color: C.text, fontSize: 20, fontFamily: FONT.bold, marginBottom: 16 }}>
        Choose a workspace
      </Text>
      <FlatList
        data={workspaces}
        keyExtractor={w => w.id}
        contentContainerStyle={{ gap: 10 }}
        style={{ flexGrow: 0 }}
        renderItem={({ item }) => (
          <Card onPress={() => pick(item)} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Avatar name={item.name} size={38} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 14.5, fontFamily: FONT.semibold }}>{item.name}</Text>
              <Text style={{ color: C.textQuiet, fontSize: 12, fontFamily: FONT.regular, textTransform: "capitalize" }}>{item.role}</Text>
            </View>
          </Card>
        )}
      />
    </View>
  );
}

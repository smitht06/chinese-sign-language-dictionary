import { Tabs } from "expo-router";
import { Platform, Text } from "react-native";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#1a73e8",
        headerTitleAlign: "center",
        // Web shows the site top nav (root layout) instead of per-tab
        // headers + the bottom bar; native keeps both.
        headerShown: Platform.OS !== "web",
        tabBarStyle: Platform.OS === "web" ? { display: "none" } : undefined,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Search",
          tabBarLabel: "Search",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🔍</Text>,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: "Browse",
          tabBarLabel: "Browse",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>📖</Text>,
        }}
      />
      <Tabs.Screen
        name="themes"
        options={{
          title: "Themes",
          tabBarLabel: "Themes",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🏷️</Text>,
        }}
      />
    </Tabs>
  );
}

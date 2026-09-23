import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Bottom navigation removed per CR: every destination remains reachable
        // through the side menu (AppDrawer). The (tabs) route group is kept
        // intact so routes, deep links and back navigation still work - only
        // the visible bar is removed. tabBarButton: () => null drops each item
        // (no placeholders), and display:'none' removes the bar itself (no
        // empty space at the bottom).
        tabBarButton: () => null,
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="ideas" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

import { Redirect } from 'expo-router';

/** App opens directly on Home — no login gate for now. */
export default function Index() {
  return <Redirect href="/(tabs)" />;
}

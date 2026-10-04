import { AppNavigation } from "./app-navigation";

/** Public navigation stays usable; no account information is guessed. */
export function AppShellLoading() {
  return <AppNavigation email={null} displayName="" brokered={false} loading />;
}

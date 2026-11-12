// One QueryClient for the whole app; the provider in app/_layout.tsx uses
// this instance. Import it for cache calls outside components, for example
// queryClient.invalidateQueries or setQueryData in websocket or push
// handlers; inside components useQueryClient() returns this same instance.
import { AppState, Platform } from "react-native";
import { focusManager, QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();

// On native there is no "window focus" event, so tell React Query when the app
// returns to the foreground — stale data (e.g. jobs edited by an admin) refetches.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (status) => focusManager.setFocused(status === "active"));
}

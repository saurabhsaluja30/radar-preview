import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";

/** Refetch a query every time the screen comes back into focus (skips the first mount). */
export function useRefreshOnFocus(refetch: () => unknown) {
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      refetch();
    }, [refetch]),
  );
}

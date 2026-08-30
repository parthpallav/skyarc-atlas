import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { loadTokens, isAuthenticated } from "../src/lib/auth";
import { LoadingScreen } from "../src/components/ui";

export default function Index() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    void loadTokens().then(() => {
      setAuthed(isAuthenticated());
      setReady(true);
    });
  }, []);

  if (!ready) return <LoadingScreen message="Starting Skyarc Atlas..." />;
  if (!authed) return <Redirect href="/login" />;
  return <Redirect href="/(tabs)/locations" />;
}

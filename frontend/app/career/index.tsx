import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth/AuthContext";
import { ScreenHeader } from "@/src/components/Brand";
import { Button } from "@/src/components/ui";
import { CareerToolsCards, AiDisclaimer, useCareerStyles, useCareerUsage } from "@/src/components/career";

export default function CareerHub() {
  const styles = useCareerStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { data } = useCareerUsage();

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Career Tools" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}>
        <View style={{ gap: 4 }}>
          <Text style={styles.h}>Build, check & practise</Text>
          <Text style={styles.muted}>
            Create ATS-friendly resumes, check your fit for a job and prepare for interviews — all in one place.
          </Text>
        </View>
        {!user ? (
          <Button title="Login to use Career Tools" onPress={() => router.push("/auth/login")} testID="career-login" />
        ) : (
          <>
            {data?.tier ? (
              <Text style={styles.muted} testID="career-tier">
                Your access level: {data.tier === "free" ? "Free" : `Member (${data.tier.replace("_", "-")})`}
              </Text>
            ) : null}
            <CareerToolsCards />
          </>
        )}
        <AiDisclaimer />
      </ScrollView>
    </View>
  );
}

import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { Button, Input, Chip } from "@/src/components/ui";
import { ScreenHeader } from "@/src/components/Brand";
import { useToast } from "@/src/components/Toast";
import { INDUSTRIES, INDUSTRIES_WITH_OTHER, INDUSTRY_SHORT, PREF_WORK_MODES, EXPERIENCE_RANGES } from "@/src/constants";

export default function Profile() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({
    full_name: user?.full_name || "",
    mobile: user?.mobile || "",
    industry: user?.industry || "",
    current_designation: (user as any)?.current_designation || "",
    current_salary: (user as any)?.current_salary || "",
    preferred_designation: (user as any)?.preferred_designation || "",
    preferred_location: user?.preferred_location || "",
    preferred_work_mode: (user as any)?.preferred_work_mode || "",
    preferred_experience: user?.preferred_experience || "",
  });
  const [prefIndustries, setPrefIndustries] = useState<string[]>((user as any)?.preferred_industries || []);
  const toggleInd = (i: string) =>
    setPrefIndustries((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api("/auth/profile", { method: "PUT", body: { ...form, preferred_industries: prefIndustries } });
      await refresh();
      toast.show("Profile updated", "success");
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const changePw = async () => {
    if (!pw.current_password || !pw.new_password) return toast.show("Fill both password fields", "error");
    setChanging(true);
    try {
      await api("/auth/change-password", { method: "POST", body: pw });
      toast.show("Password changed", "success");
      setPw({ current_password: "", new_password: "" });
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    } finally {
      setChanging(false);
    }
  };

  if (!user) {
    router.replace("/auth/login");
    return null;
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Edit Profile" />
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 14 }}>
          <Input label="Full Name" value={form.full_name} onChangeText={(v) => set("full_name", v)} testID="profile-name" />
          <Input label="Email" value={user.email} editable={false} testID="profile-email" />
          <Input label="Mobile" value={form.mobile} onChangeText={(v) => set("mobile", v)} keyboardType="phone-pad" testID="profile-mobile" />

          <View style={{ gap: 8 }}>
            <Text style={styles.label}>Industry</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {INDUSTRIES_WITH_OTHER.map((c) => (
                <Chip key={c} label={INDUSTRY_SHORT[c] || c} selected={form.industry === c} onPress={() => set("industry", c)} />
              ))}
            </ScrollView>
          </View>

          <Input label="Current Designation" value={form.current_designation} onChangeText={(v) => set("current_designation", v)} placeholder="Not Provided" testID="profile-designation" />
          <Input label="Current Annual CTC" value={form.current_salary} onChangeText={(v) => set("current_salary", v)} placeholder="Not Provided" testID="profile-salary" />

          <View style={{ gap: 8 }}>
            <Text style={styles.label}>Preferred Industry (select multiple)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {INDUSTRIES.map((c) => (
                <Chip key={c} label={INDUSTRY_SHORT[c] || c} selected={prefIndustries.includes(c)} onPress={() => toggleInd(c)} />
              ))}
            </ScrollView>
          </View>

          <Input label="Preferred Designation" value={form.preferred_designation} onChangeText={(v) => set("preferred_designation", v)} placeholder="Not Provided" testID="profile-pref-designation" />
          <Input label="Preferred Location / Country" value={form.preferred_location} onChangeText={(v) => set("preferred_location", v)} placeholder="Not Provided" testID="profile-location" />

          <View style={{ gap: 8 }}>
            <Text style={styles.label}>Preferred Work Mode</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {PREF_WORK_MODES.map((m) => (
                <Chip key={m} label={m} selected={form.preferred_work_mode === m} onPress={() => set("preferred_work_mode", m)} />
              ))}
            </ScrollView>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={styles.label}>Preferred Experience</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {EXPERIENCE_RANGES.map((e) => (
                <Chip key={e} label={e} selected={form.preferred_experience === e} onPress={() => set("preferred_experience", form.preferred_experience === e ? "" : e)} />
              ))}
            </ScrollView>
          </View>

          <Button title="Save Changes" onPress={save} loading={saving} testID="profile-save" />
        </View>

        {user.auth_provider === "password" && (
          <View style={styles.pwBlock}>
            <Text style={styles.blockTitle}>Change Password</Text>
            <View style={{ gap: 14 }}>
              <Input label="Current Password" value={pw.current_password} onChangeText={(v) => setPw((p) => ({ ...p, current_password: v }))} secureTextEntry testID="pw-current" />
              <Input label="New Password" value={pw.new_password} onChangeText={(v) => setPw((p) => ({ ...p, new_password: v }))} secureTextEntry testID="pw-new" />
              <Button title="Update Password" variant="outline" onPress={changePw} loading={changing} testID="pw-submit" />
            </View>
          </View>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  label: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  pwBlock: { marginTop: 30, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 24 },
  blockTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800", marginBottom: 16 },
}));

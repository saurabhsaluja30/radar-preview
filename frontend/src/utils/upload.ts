// Multipart upload helper that works on web and native (expo/fetch handles file:// URIs).
import { Platform } from "react-native";
import { fetch as expoFetch } from "expo/fetch";
import { ApiError, getAuthToken, notifySignedOut } from "@/src/api/client";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

export async function uploadForm<T = any>(
  path: string,
  file: { uri: string; name: string; mimeType?: string | null },
  field = "file",
): Promise<T> {
  const form = new FormData();
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  if (Platform.OS === "web") {
    const blob = await (await fetch(file.uri)).blob();
    form.append(field, blob, file.name);
    const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: form });
    return parse<T>(res);
  }
  // Native: expo-file-system File is a Blob that expo/fetch can stream in multipart bodies.
  const { File } = await import("expo-file-system");
  form.append(field, new File(file.uri) as any, file.name);
  const res = await expoFetch(`${BASE}${path}`, { method: "POST", headers, body: form as any });
  return parse<T>(res as any);
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = (data && (data.detail || data.message)) || `Upload failed (${res.status})`;
    if (res.status === 401) notifySignedOut(typeof detail === "string" ? detail : "");
    throw new ApiError(typeof detail === "string" ? detail : "Upload failed", res.status);
  }
  return data as T;
}

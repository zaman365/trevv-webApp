import type { SecureSessionStore } from "@founderhq/auth-client";
import * as SecureStore from "expo-secure-store";
export const secureSessionStore: SecureSessionStore = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  remove: (key) => SecureStore.deleteItemAsync(key),
};

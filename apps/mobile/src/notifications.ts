import * as Notifications from "expo-notifications";
export async function registerNotificationFoundation(): Promise<string | null> {
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return null;
  const token = await Notifications.getExpoPushTokenAsync();
  return token.data;
}

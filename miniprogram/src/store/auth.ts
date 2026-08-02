import Taro from "@tarojs/taro";
import type { MpUser } from "../services/api";

const TOKEN_KEY = "lejoy_mp_token";
const USER_KEY = "lejoy_mp_user";

export function getToken(): string {
  return Taro.getStorageSync<string>(TOKEN_KEY) || "";
}

export function saveSession(token: string, user: MpUser): void {
  Taro.setStorageSync(TOKEN_KEY, token);
  Taro.setStorageSync(USER_KEY, user);
}

export function getStoredUser(): MpUser | undefined {
  return Taro.getStorageSync<MpUser>(USER_KEY) || undefined;
}

export function clearSession(): void {
  Taro.removeStorageSync(TOKEN_KEY);
  Taro.removeStorageSync(USER_KEY);
}

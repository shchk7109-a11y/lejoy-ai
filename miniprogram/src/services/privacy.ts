import Taro from "@tarojs/taro";

export function ensurePrivacyAuthorized(): Promise<void> {
  if (typeof Taro.requirePrivacyAuthorize !== "function") return Promise.resolve();
  return new Promise((resolve, reject) => {
    Taro.requirePrivacyAuthorize({
      success: () => resolve(),
      fail: (result) => reject(new Error(result.errMsg || "需要先同意用户隐私保护指引")),
    });
  });
}

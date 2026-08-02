import type { PropsWithChildren } from "react";
import { ConfigProvider } from "@nutui/nutui-react-taro";
import { AccessibilityProvider } from "./store/accessibility";
import "@nutui/nutui-react-taro/dist/style.css";
import "./app.scss";

const nutTheme = {
  nutuiColorPrimary: "#c2410c",
  nutuiColorPrimaryStop1: "#ea580c",
  nutuiColorPrimaryStop2: "#c2410c",
  nutuiColorPrimaryPressed: "#9a3412",
  nutuiButtonXlargeHeight: "108rpx",
  nutuiButtonXlargeFontSize: "40rpx",
  nutuiButtonXlargeBorderRadius: "24rpx",
  nutuiButtonDefaultFontSize: "36rpx",
  nutuiFontSizeXxxs: "28rpx",
  nutuiFontSizeXxs: "28rpx",
  nutuiFontSizeXs: "28rpx",
  nutuiFontSizeS: "32rpx",
  nutuiFontSizeBase: "36rpx",
  nutuiFontSizeL: "40rpx",
  nutuiFontSizeXl: "44rpx",
  nutuiFontSizeXxl: "48rpx",
};

function App({ children }: PropsWithChildren) {
  return (
    <AccessibilityProvider>
      <ConfigProvider theme={nutTheme}>{children}</ConfigProvider>
    </AccessibilityProvider>
  );
}

export default App;

export type ReleaseChannel = "develop" | "trial" | "release";

export const MINIPROGRAM_VERSION = __LEJOY_MINIPROGRAM_VERSION__;
export const RELEASE_CHANNEL = __LEJOY_RELEASE_CHANNEL__ as ReleaseChannel;

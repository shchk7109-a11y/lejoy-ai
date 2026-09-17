declare module "cookie" {
  export function parse(
    str: string,
    options?: Record<string, unknown>
  ): Record<string, string>;
  export function serialize(
    name: string,
    value: string,
    options?: { path?: string; secure?: boolean; httpOnly?: boolean; sameSite?: "strict" | "lax" | "none"; maxAge?: number }
  ): string;
}

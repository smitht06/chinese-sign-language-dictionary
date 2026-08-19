// expo-router 57 registers these matchers at runtime (testing-library/expect)
// but ships no type declarations for them — declare them here so tsc sees them.
declare global {
  namespace jest {
    interface Matchers<R, T = {}> {
      toHavePathname(pathname: string): R;
      toHavePathnameWithParams(pathname: string): R;
      toHaveSegments(segments: string[]): R;
      toHaveSearchParams(params: Record<string, string>): R;
    }
  }
}

export {};

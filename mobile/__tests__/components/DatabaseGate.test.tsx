import type { ReactNode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Platform, Text } from "react-native";
import DatabaseGate, {
  DbErrorScreen,
} from "../../app/components/DatabaseGate";

// File-local override of the central expo-sqlite mock (moduleNameMapper
// mocks apply only where no jest.mock factory exists): fail the first N
// provider mounts via onError, then behave like the success path.
const mockBehavior = { failuresRemaining: 0, onErrorCalls: 0, mounts: 0 };
jest.mock("expo-sqlite", () => {
  const React = require("react");
  return {
    SQLiteProvider: ({
      children,
      onInit,
      onError,
    }: {
      children?: ReactNode;
      onInit?: (db: unknown) => Promise<void> | void;
      onError?: (error: Error) => void;
    }) => {
      React.useEffect(() => {
        mockBehavior.mounts += 1;
        if (mockBehavior.failuresRemaining > 0) {
          mockBehavior.failuresRemaining -= 1;
          mockBehavior.onErrorCalls += 1;
          onError?.(new Error("boom"));
        } else {
          void onInit?.({
            getAllAsync: async () => [],
            execAsync: async () => {},
          });
        }
      }, []);
      return children ?? null;
    },
    useSQLiteContext: jest.fn(),
  };
});

describe("DatabaseGate", () => {
  beforeEach(() => {
    mockBehavior.failuresRemaining = 0;
    mockBehavior.onErrorCalls = 0;
    mockBehavior.mounts = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows the splash until the database opens, then renders children", async () => {
    render(
      <DatabaseGate>
        <Text>content</Text>
      </DatabaseGate>,
    );

    expect(screen.getByTestId("db-loading")).toBeOnTheScreen();

    await waitFor(() =>
      expect(screen.queryByTestId("db-loading")).toBeNull(),
    );
    expect(screen.getByText("content")).toBeOnTheScreen();
  });

  it("auto-retries once silently, then shows the error screen with a working Retry", async () => {
    jest.useFakeTimers();
    mockBehavior.failuresRemaining = 2;

    render(
      <DatabaseGate>
        <Text>content</Text>
      </DatabaseGate>,
    );

    // First mount fails → deferred onError handler runs.
    act(() => {
      jest.advanceTimersByTime(0);
    });
    // Auto-retry pending: still on the splash, no error flash.
    expect(screen.getByTestId("db-loading")).toBeOnTheScreen();
    expect(screen.queryByTestId("db-error")).toBeNull();

    // Auto-retry fires → remount fails again → error screen.
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    act(() => {
      jest.advanceTimersByTime(0);
    });
    expect(screen.getByTestId("db-error")).toBeOnTheScreen();
    expect(screen.getByTestId("db-retry")).toBeOnTheScreen();
    expect(screen.queryByText("content")).toBeNull();
    expect(mockBehavior.onErrorCalls).toBe(2); // exactly one auto-retry
    expect(mockBehavior.mounts).toBe(2);

    // No further automatic retries once the error screen is up.
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    expect(mockBehavior.onErrorCalls).toBe(2);

    // Manual Retry succeeds now that the mock is healthy.
    fireEvent.press(screen.getByTestId("db-retry"));
    await waitFor(() =>
      expect(screen.queryByTestId("db-error")).toBeNull(),
    );
    expect(screen.getByText("content")).toBeOnTheScreen();
    expect(screen.queryByTestId("db-loading")).toBeNull();
    expect(mockBehavior.mounts).toBe(3);
  });

  it("shows the browser-update hint on web when SharedArrayBuffer is missing", () => {
    // jest-replaceProperty auto-restores Platform.OS after this test.
    jest.replaceProperty(Platform, "OS", "web");
    const originalSab = (globalThis as { SharedArrayBuffer?: unknown })
      .SharedArrayBuffer;
    (globalThis as { SharedArrayBuffer?: unknown }).SharedArrayBuffer =
      undefined;
    try {
      render(
        <DbErrorScreen error={new Error("boom")} onRetry={jest.fn()} />,
      );
      expect(screen.getByTestId("db-error")).toBeOnTheScreen();
      expect(screen.getByTestId("db-retry")).toBeOnTheScreen();
      expect(screen.getByText(/SharedArrayBuffer/)).toBeOnTheScreen();
    } finally {
      (globalThis as { SharedArrayBuffer?: unknown }).SharedArrayBuffer =
        originalSab;
    }
  });

  it("omits the browser-update hint on web when SharedArrayBuffer exists", () => {
    jest.replaceProperty(Platform, "OS", "web");
    render(<DbErrorScreen error={null} onRetry={jest.fn()} />);
    expect(screen.queryByText(/SharedArrayBuffer/)).toBeNull();
  });
});

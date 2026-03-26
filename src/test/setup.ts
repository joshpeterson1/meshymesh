/// <reference types="vitest/globals" />
import "@testing-library/jest-dom/vitest";

// Mock Tauri APIs that aren't available in test environment
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

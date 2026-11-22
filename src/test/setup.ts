import "@testing-library/jest-dom/vitest";

if (typeof window !== "undefined") {
Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
}

// Tests never reach a real database: the runtime and operator connection strings are removed
// before any test file runs, so an unmocked query fails instead of touching production (egress).
// A test that needs a connection sets its own fake value and mocks the driver.
delete process.env["DATABASE_URL"];
delete process.env["MIGRATION_URL"];
delete process.env["OMNI_DATABASE_URL"];

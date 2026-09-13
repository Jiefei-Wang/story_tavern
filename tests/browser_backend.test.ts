import test from "node:test";
import assert from "node:assert/strict";
import { useBackendStore } from "../src/stores/useBackendStore";
import { DEFAULT_BACKENDS } from "./fixtures/legacyInitialData";

test("browser connection and model refresh use HTTP without native IPC", async (t) => {
  const backend = { ...DEFAULT_BACKENDS[0], authType: "none" as const, baseUrl: "https://example.test/v1/" };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.equal(url, "https://example.test/v1/models");
    calls++;
    return new Response(JSON.stringify({ data: [{ id: "test-model" }] }));
  });
  const result = await useBackendStore.getState().testConnection(backend);
  assert.equal(result.success, true);
  assert.equal(result.model_count, 1);
  assert.ok((await useBackendStore.getState().refreshModels(backend)).includes("test-model"));
  assert.equal(calls, 2);
});

test("browser connection rejects HTTP errors and malformed model responses", async (t) => {
  const backend = { ...DEFAULT_BACKENDS[0], authType: "none" as const };
  t.mock.method(globalThis, "fetch", async () => new Response("Unauthorized", { status: 401 }));
  assert.match((await useBackendStore.getState().testConnection(backend)).error!, /HTTP 401/);
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ unexpected: true })));
  assert.equal((await useBackendStore.getState().testConnection(backend)).success, false);
  assert.equal(useBackendStore.getState().testingStatus[backend.id].testing, false);
});

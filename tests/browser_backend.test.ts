import test from "node:test";
import assert from "node:assert/strict";
import { useBackendStore } from "../src/stores/useBackendStore";
import { DEFAULT_BACKENDS } from "./fixtures/legacyInitialData";
import { storageService } from "../src/db/storage";

test("backend operations preserve credential lifetime on success and failure", async (t) => {
  const backend = { ...DEFAULT_BACKENDS[0], authType: "none" as const, secretRef: "existing", models: [] };
  const secrets = new Map([["existing", "original"]]);
  let writeFails = false, requestFails = false;
  t.mock.method(storageService, "setSecret", async (ref: string, value: string) => {
    secrets.set(ref, value);
    if (writeFails) throw new Error("credential write failed");
  });
  t.mock.method(storageService, "deleteSecret", async (ref: string) => { secrets.delete(ref); });
  t.mock.method(storageService, "saveBackend", async () => {});
  t.mock.method(console, "warn", () => {});
  t.mock.method(globalThis, "fetch", async () => {
    assert.ok([...secrets.values()].includes("override"));
    if (requestFails) throw new Error("request failed");
    return new Response(JSON.stringify({ data: [{ id: "test-model" }] }));
  });
  for (const operation of ["testConnection", "refreshModels"] as const) {
    for (const failure of ["none", "write", "request"]) {
      writeFails = failure === "write";
      requestFails = failure === "request";
      const result = await useBackendStore.getState()[operation](backend, " override ", false);
      if (operation === "testConnection") assert.equal((result as { success: boolean }).success, failure === "none");
      else assert.deepEqual(result, failure === "none" ? ["test-model"] : []);
      assert.deepEqual([...secrets], [["existing", "original"]]);
    }
    writeFails = requestFails = false;
    await useBackendStore.getState()[operation](backend, "override", true);
    assert.deepEqual([...secrets], [["existing", "override"]]);
    secrets.set("existing", "original");
  }
});

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

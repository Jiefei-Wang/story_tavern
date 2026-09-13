import { create } from "zustand";
import { invoke } from "../db/host";
import { Backend } from "../types";
import { storageService } from "../db/storage";
import { sanitizeCustomHeaders } from "../engine/runtime/AgentRuntime";

async function listBrowserModels(backend: Backend, secretRef?: string): Promise<string[]> {
  const headers = sanitizeCustomHeaders(backend.customHeaders);
  if ((backend.authType || "bearer") === "bearer") {
    const token = secretRef ? localStorage.getItem(`secret_${secretRef}`) : null;
    if (!token?.trim()) throw new Error(`Missing Bearer credential for backend '${backend.name}'`);
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), backend.timeoutMs || 20000);
  try {
    const response = await fetch(`${backend.baseUrl.trim().replace(/\/+$/, "")}/models`, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    const body = await response.json();
    const models = body.data ?? body.models;
    if (!Array.isArray(models)) throw new Error("Invalid models response: expected data or models array");
    return models.map((model: any) => model.id ?? model.name).filter((id: unknown): id is string => typeof id === "string");
  } finally {
    clearTimeout(timeout);
  }
}

interface TestConnectionResult {
  success: boolean;
  model_count: number;
  error?: string;
  latency_ms: number;
}

interface BackendState {
  backends: Backend[];
  isLoading: boolean;
  testingStatus: Record<string, { testing: boolean; result?: TestConnectionResult }>;
  loadBackends: () => Promise<void>;
  saveBackend: (backend: Backend, apiKey?: string) => Promise<void>;
  deleteBackend: (id: string) => Promise<void>;
  testConnection: (
    backend: Backend,
    apiKeyOverride?: string,
    persistStatus?: boolean
  ) => Promise<TestConnectionResult>;
  refreshModels: (
    backend: Backend,
    apiKeyOverride?: string,
    persist?: boolean
  ) => Promise<string[]>;
}

export const useBackendStore = create<BackendState>((set, get) => ({
  backends: [],
  isLoading: false,
  testingStatus: {},

  loadBackends: async () => {
    set({ isLoading: true });
    const backends = await storageService.getBackends();
    set({ backends: backends.map(b => ({ ...b, status: "unknown" })), isLoading: false });
  },

  saveBackend: async (backend: Backend, apiKey?: string) => {
    if (apiKey && apiKey.trim()) {
      const secretRef = backend.secretRef || `secret_${backend.id}`;
      backend.secretRef = secretRef;
      await storageService.setSecret(secretRef, apiKey.trim());
    }

    await storageService.saveBackend(backend);
    const backends = await storageService.getBackends();
    set({ backends });
  },

  deleteBackend: async (id: string) => {
    await storageService.deleteBackend(id);
    const backends = await storageService.getBackends();
    set({ backends });
  },

  testConnection: async (
    backend: Backend,
    apiKeyOverride?: string,
    persistStatus: boolean = false
  ) => {
    const backendId = backend.id;
    set((state) => ({
      testingStatus: {
        ...state.testingStatus,
        [backendId]: { testing: true },
      },
    }));

    let effectiveSecretRef = backend.secretRef;
    let isTempSecret = false;

    try {
      if (apiKeyOverride && apiKeyOverride.trim()) {
        if (persistStatus) {
          effectiveSecretRef = effectiveSecretRef || `secret_${backend.id}`;
          await storageService.setSecret(effectiveSecretRef, apiKeyOverride.trim());
        } else {
          // Ephemeral secret for draft testing
          isTempSecret = true;
          effectiveSecretRef = `temp_secret_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await storageService.setSecret(effectiveSecretRef, apiKeyOverride.trim());
        }
      }

      const started = Date.now();
      const res: TestConnectionResult = storageService.usesLocalService() ? await invoke<TestConnectionResult>("backend_test_connection", {
        baseUrl: backend.baseUrl,
        authType: backend.authType || "bearer",
        secretRef: effectiveSecretRef || null,
        headers: backend.customHeaders || {},
        timeoutMs: backend.timeoutMs || 15000,
      }) : { success: true, model_count: (await listBrowserModels(backend, effectiveSecretRef)).length, latency_ms: Date.now() - started };

      if (persistStatus) {
        const updatedBackend: Backend = {
          ...backend,
          status: res.success ? "online" : "offline",
          lastTestedAt: new Date().toISOString(),
        };
        await storageService.saveBackend(updatedBackend);
        set((state) => ({
          backends: state.backends.map((b) => (b.id === backend.id ? updatedBackend : b)),
        }));
      }

      set((state) => ({
        testingStatus: {
          ...state.testingStatus,
          [backendId]: { testing: false, result: res },
        },
      }));

      return res;
    } catch (err: any) {
      const errRes: TestConnectionResult = {
        success: false,
        model_count: 0,
        error: err?.message || String(err),
        latency_ms: 0,
      };

      if (persistStatus) {
        const updatedBackend: Backend = {
          ...backend,
          status: "offline",
          lastTestedAt: new Date().toISOString(),
        };
        await storageService.saveBackend(updatedBackend);
        set((state) => ({
          backends: state.backends.map((b) => (b.id === backend.id ? updatedBackend : b)),
        }));
      }

      set((state) => ({
        testingStatus: {
          ...state.testingStatus,
          [backendId]: { testing: false, result: errRes },
        },
      }));

      return errRes;
    } finally {
      if (isTempSecret && effectiveSecretRef) {
        await storageService.deleteSecret(effectiveSecretRef).catch(() => {});
      }
    }
  },

  refreshModels: async (
    backend: Backend,
    apiKeyOverride?: string,
    persist: boolean = false
  ) => {
    let effectiveSecretRef = backend.secretRef;
    let isTempSecret = false;

    try {
      if (apiKeyOverride && apiKeyOverride.trim()) {
        if (persist) {
          effectiveSecretRef = effectiveSecretRef || `secret_${backend.id}`;
          await storageService.setSecret(effectiveSecretRef, apiKeyOverride.trim());
        } else {
          isTempSecret = true;
          effectiveSecretRef = `temp_secret_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await storageService.setSecret(effectiveSecretRef, apiKeyOverride.trim());
        }
      }

      const models = storageService.usesLocalService() ? await invoke<string[]>("backend_list_models", {
        baseUrl: backend.baseUrl,
        authType: backend.authType || "bearer",
        secretRef: effectiveSecretRef || null,
        headers: backend.customHeaders || {},
        timeoutMs: backend.timeoutMs || 20000,
      }) : await listBrowserModels(backend, effectiveSecretRef);

      if (Array.isArray(models) && models.length > 0) {
        const existing = backend.models || [];
        const merged = Array.from(new Set([...models, ...existing]));
        if (persist) {
          const updated: Backend = {
            ...backend,
            models: merged,
            status: "online",
          };
          await storageService.saveBackend(updated);
          set((state) => ({
            backends: state.backends.map((b) => (b.id === backend.id ? updated : b)),
          }));
        }
        return merged;
      }
      return backend.models || [];
    } catch (err) {
      console.warn("Refresh models failed:", err);
      return backend.models || [];
    } finally {
      if (isTempSecret && effectiveSecretRef) {
        await storageService.deleteSecret(effectiveSecretRef).catch(() => {});
      }
    }
  },
}));

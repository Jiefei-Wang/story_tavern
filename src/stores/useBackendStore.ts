import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { Backend } from "../types";
import { storageService } from "../db/storage";

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
  testConnection: (backend: Backend, apiKeyOverride?: string) => Promise<TestConnectionResult>;
  refreshModels: (backend: Backend) => Promise<string[]>;
}

export const useBackendStore = create<BackendState>((set, get) => ({
  backends: [],
  isLoading: false,
  testingStatus: {},

  loadBackends: async () => {
    set({ isLoading: true });
    const backends = await storageService.getBackends();
    set({ backends, isLoading: false });
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

  testConnection: async (backend: Backend, apiKeyOverride?: string) => {
    const backendId = backend.id;
    set((state) => ({
      testingStatus: {
        ...state.testingStatus,
        [backendId]: { testing: true },
      },
    }));

    try {
      let secretRef = backend.secretRef;
      if (apiKeyOverride && apiKeyOverride.trim()) {
        secretRef = secretRef || `secret_${backend.id}`;
        await storageService.setSecret(secretRef, apiKeyOverride.trim());
      }

      const res = await invoke<TestConnectionResult>("backend_test_connection", {
        baseUrl: backend.baseUrl,
        secretRef: secretRef || null,
        headers: backend.customHeaders || {},
        timeoutMs: backend.timeoutMs || 15000,
      });

      // Update backend status
      const updatedBackend: Backend = {
        ...backend,
        status: res.success ? "online" : "offline",
        lastTestedAt: new Date().toISOString(),
      };
      await storageService.saveBackend(updatedBackend);

      set((state) => ({
        backends: state.backends.map((b) => (b.id === backend.id ? updatedBackend : b)),
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

      const updatedBackend: Backend = {
        ...backend,
        status: "offline",
        lastTestedAt: new Date().toISOString(),
      };
      await storageService.saveBackend(updatedBackend);

      set((state) => ({
        backends: state.backends.map((b) => (b.id === backend.id ? updatedBackend : b)),
        testingStatus: {
          ...state.testingStatus,
          [backendId]: { testing: false, result: errRes },
        },
      }));

      return errRes;
    }
  },

  refreshModels: async (backend: Backend) => {
    try {
      const models = await invoke<string[]>("backend_list_models", {
        baseUrl: backend.baseUrl,
        secretRef: backend.secretRef || null,
        headers: backend.customHeaders || {},
        timeoutMs: backend.timeoutMs || 20000,
      });

      if (Array.isArray(models) && models.length > 0) {
        // Merge with existing models
        const existing = backend.models || [];
        const merged = Array.from(new Set([...models, ...existing]));
        const updated: Backend = {
          ...backend,
          models: merged,
          status: "online",
        };
        await storageService.saveBackend(updated);
        set((state) => ({
          backends: state.backends.map((b) => (b.id === backend.id ? updated : b)),
        }));
        return merged;
      }
      return backend.models || [];
    } catch (err) {
      console.warn("Refresh models failed:", err);
      return backend.models || [];
    }
  },
}));

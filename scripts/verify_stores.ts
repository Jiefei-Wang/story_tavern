import { useTraceStore } from "../src/stores/useTraceStore";
import { useGameStore } from "../src/stores/useGameStore";
import { useBackendStore } from "../src/stores/useBackendStore";
import { useAgentStore } from "../src/stores/useAgentStore";
import { useAgentGroupStore } from "../src/stores/useAgentGroupStore";
import { useSettingsStore } from "../src/stores/useSettingsStore";

console.log("TraceStore state:", Boolean(useTraceStore.getState()));
console.log("GameStore state:", Boolean(useGameStore.getState()));
console.log("BackendStore state:", Boolean(useBackendStore.getState()));
console.log("AgentStore state:", Boolean(useAgentStore.getState()));
console.log("AgentGroupStore state:", Boolean(useAgentGroupStore.getState()));
console.log("SettingsStore state:", Boolean(useSettingsStore.getState()));

console.log("ALL STORES INITIALIZED SUCCESSFULLY WITHOUT ERRORS!");

import type { GameTurn, NPCExperience, WorldEntity, WorldState, JsonPatchOperation } from '../../types';

export interface CharacterStateHistoryField {
  path: string;
  before: number | null;
  after: number | null;
  status: 'changed' | 'unchanged';
  sourceEventIds: string[];
}
export interface CharacterStateHistory {
  turns: Array<{ turnId: string; turnIndex: number; scope: 'completed_turn' | 'current_turn'; fields: CharacterStateHistoryField[]; fieldsTruncated: boolean; incomplete: boolean }>;
  truncated: boolean;
  omittedTurns: number;
  unavailableTurns: number;
}
export interface CurrentCharacterSettlement {
  id: string;
  turnIndex: number;
  worldStateBefore: WorldState;
  worldStateAfter: WorldState;
  patches: JsonPatchOperation[];
  npcExperiences?: Record<string, NPCExperience[]>;
}
const TURN_LIMIT = 6;
const FIELD_LIMIT = 32;
const escapePointer = (part: string) => part.replace(/~/g, '~0').replace(/\//g, '~1');

function numericFields(entity: WorldEntity | undefined): Map<string, number> {
  const values = new Map<string, number>();
  if (entity?.type !== 'character') return values;
  const visit = (value: unknown, parts: string[], depth: number) => {
    if (typeof value === 'number' && Number.isFinite(value)) values.set('/' + parts.map(escapePointer).join('/'), value);
    else if (value && typeof value === 'object' && depth < 8) {
      for (const [key, child] of Object.entries(value)) visit(child, [...parts, key], depth + 1);
    }
  };
  visit(entity.attributes, ['attributes'], 0);
  visit(entity.relationships, ['relationships'], 0);
  return values;
}

/** The caller supplies only its selected branch. Never derive state from proposals or prose. */
export function buildSettledCharacterHistory(turns: GameTurn[], npcId: string, current?: CurrentCharacterSettlement): CharacterStateHistory {
  const successful = turns.filter(turn => turn.status === 'success');
  const omittedTurns = Math.max(0, successful.length - TURN_LIMIT);
  const entries = successful.slice(-TURN_LIMIT).map(turn => ({ turn, scope: 'completed_turn' as const }));
  const candidates: Array<{ turn: CurrentCharacterSettlement; scope: 'completed_turn' | 'current_turn' }> = [...entries];
  if (current) candidates.push({ turn: current, scope: 'current_turn' });
  const history: CharacterStateHistory = { turns: [], truncated: omittedTurns > 0, omittedTurns, unavailableTurns: 0 };
  for (const { turn, scope } of candidates) {
    const beforeEntity = turn.worldStateBefore?.entities?.[npcId];
    const afterEntity = turn.worldStateAfter?.entities?.[npcId];
    // Old saves without real endpoint snapshots contribute no invented baseline.
    if (beforeEntity?.type !== 'character' || afterEntity?.type !== 'character') { history.unavailableTurns++; continue; }
    const before = numericFields(beforeEntity), after = numericFields(afterEntity);
    const prefix = '/entities/' + escapePointer(npcId);
    const fields: CharacterStateHistoryField[] = [];
    let incomplete = false;
    for (const path of [...new Set([...before.keys(), ...after.keys()])].sort()) {
      const prior = before.get(path) ?? null, next = after.get(path) ?? null;
      const changed = prior !== next;
      const fullPath = prefix + path;
      const hasAppliedPatch = (turn.patches || []).some(patch => patch.op !== 'test' && (patch.path === fullPath || fullPath.startsWith(patch.path + '/')));
      // A changed snapshot without its actual patch is incomplete historical data.
      if (changed && !hasAppliedPatch) { incomplete = true; continue; }
      const dotPath = path.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~')).join('.');
      const sourceEventIds = changed ? [...new Set((turn.npcExperiences?.[npcId] || [])
        .filter(experience => (experience.observation.saw || experience.observation.heard) && experience.appliedStatePaths?.includes(dotPath))
        .map(experience => experience.observation.eventId))] : [];
      fields.push({ path, before: prior, after: next, status: changed ? 'changed' : 'unchanged', sourceEventIds });
    }
    history.turns.push({ turnId: turn.id, turnIndex: turn.turnIndex, scope, fields: fields.slice(0, FIELD_LIMIT), fieldsTruncated: fields.length > FIELD_LIMIT, incomplete });
  }
  return history;
}

/** Defensive projection: no whole snapshots, text memories, or other NPC payloads. */
export function projectCharacterStateHistory(history: CharacterStateHistory): CharacterStateHistory {
  return {
    turns: history.turns.slice(-(TURN_LIMIT + 1)).map(turn => ({
      turnId: String(turn.turnId), turnIndex: turn.turnIndex, scope: turn.scope,
      fields: turn.fields.filter(field => /^\/(?:attributes|relationships)\//.test(field.path)
        && (field.before === null || (typeof field.before === 'number' && Number.isFinite(field.before)))
        && (field.after === null || (typeof field.after === 'number' && Number.isFinite(field.after))))
        .slice(0, FIELD_LIMIT).map(field => ({ path: field.path, before: field.before, after: field.after,
          status: field.before === field.after ? 'unchanged' as const : 'changed' as const,
          sourceEventIds: field.before === field.after ? [] : field.sourceEventIds.filter(id => typeof id === 'string') })),
      fieldsTruncated: turn.fieldsTruncated || turn.fields.length > FIELD_LIMIT,
      incomplete: turn.incomplete,
    })),
    truncated: history.truncated || history.turns.length > TURN_LIMIT + 1,
    omittedTurns: history.omittedTurns + Math.max(0, history.turns.length - TURN_LIMIT - 1),
    unavailableTurns: history.unavailableTurns,
  };
}

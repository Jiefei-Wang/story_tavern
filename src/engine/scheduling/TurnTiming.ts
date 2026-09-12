import type { GameEvent, NPCReactionResult, PublicWorldEvent, TemporalBlock } from '../../types';
import { getSafeEventDuration, getSafeIntentDuration } from '../world/TimingEngine';

const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function quantity(value: string): number | null {
  if (value === '半') return 0.5;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (!/^[零〇一二两三四五六七八九十百千]+$/.test(value)) return null;
  let total = 0, pending = 0;
  for (const char of value) {
    if (char in digits) pending = digits[char];
    else { total += (pending || 1) * ({ 十: 10, 百: 100, 千: 1000 }[char] || 0); pending = 0; }
  }
  return total + pending;
}

/** Explicit elapsed waits only: speech, proposals, negation and hypothetical waits are not elapsed time. */
export function parseExplicitElapsedDurations(input: string): number[] {
  if (/^\s*(?:admin|管理员)\s*[:：]/i.test(input)) return [];
  const prose = input.replace(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"]*"|'[^']*'/g, ' ');
  const pattern = /(?:等待|等候|静候|静等|等|快进|停留|wait(?:\s+for)?|fast[ -]?forward)\s*(?:了|上|足足|整整|大约|约)?\s*(\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千]+|半)\s*(秒钟|秒|分钟|分|小时|钟头|天|seconds?|secs?|minutes?|mins?|hours?|days?)/gi;
  const values: number[] = [];
  for (const match of prose.matchAll(pattern)) {
    const preceding = prose.slice(Math.max(0, match.index! - 30), match.index);
    const clause = preceding.split(/[，,。.!！?？;；\n]/).at(-1) || '';
    if (/(?:不|别|勿|无需|不用|不要)\s*$/.test(clause) || /(?:如果|假如|假设|倘若|要是|\bif\b)/i.test(clause)) continue;
    const count = quantity(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = /^(?:小时|钟头|hours?)/.test(unit) ? 3600 : /^(?:天|days?)/.test(unit) ? 86400 : /^(?:分钟|分|minutes?|mins?)/.test(unit) ? 60 : 1;
    const seconds = count === null ? NaN : count * multiplier;
    if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 31_536_000) values.push(seconds);
  }
  return values;
}

export function parseExplicitElapsedSeconds(input: string): number | null {
  const durations = parseExplicitElapsedDurations(input);
  return durations.length ? durations.reduce((sum, seconds) => sum + seconds, 0) : null;
}

/** Bind user-specified durations to waiting blocks; never trust a model's unit conversion. */
export function normalizeTurnTiming(blocks: TemporalBlock[], input: string): TemporalBlock[] {
  const durations = parseExplicitElapsedDurations(input);
  if (!durations.length) return blocks.map(original => {
    const block = structuredClone(original);
    delete block.waitOrigin;
    if (block.kind === 'wait') { block.waitOrigin = 'implicit_response'; block.duration = 5; }
    return block;
  });
  const normalized: TemporalBlock[] = [];
  let used = 0;
  for (const original of blocks) {
    const block = structuredClone(original);
    delete block.waitOrigin;
    if (block.kind === 'admin') { normalized.push(block); continue; }
    if (block.kind === 'wait' || block.kind === 'time_skip') {
      // Extra model-invented response waits must not enlarge an explicit one-second wait.
      if (used >= durations.length) continue;
      block.duration = durations[used++];
      block.waitOrigin = 'explicit_elapsed';
      if (block.kind === 'time_skip') delete block.to;
      normalized.push(block);
      continue;
    }
    // Some compilers misencode "wait twenty minutes" as a two-second physical action.
    let events: GameEvent[] = [];
    let part = 0;
    const flush = () => {
      if (events.length) normalized.push({ ...block, id: part++ ? `${block.id}_part_${part}` : block.id, events });
      events = [];
    };
    for (const event of block.events || []) {
      const waitAction = event.type === 'wait' || (event.type === 'action' && /^(?:wait|wait_for|pause|等待|静候)$/i.test(event.op || ''));
      if (waitAction) {
        flush();
        if (used < durations.length) normalized.push({ id: `${block.id}_explicit_wait_${used + 1}`, kind: 'wait', duration: durations[used++], responseWindow: true, waitOrigin: 'explicit_elapsed' });
        continue;
      }
      events.push(event);
    }
    flush();
  }
  while (used < durations.length) normalized.push({ id: `explicit_wait_${used + 1}`, kind: 'wait', duration: durations[used++], responseWindow: true, waitOrigin: 'explicit_elapsed' });
  return normalized;
}

/** A conversational planning ceiling is not already elapsed world time. */
export function waitPlanningSeconds(block: TemporalBlock): number {
  return block.waitOrigin === 'implicit_response' ? 30 : elapsedSecondsForBlock(block);
}

/** Only Resolver-accepted intents contribute; different NPCs occupy parallel windows. */
export function settledWaitSeconds(block: TemporalBlock, reactions: Array<{ npcId: string; reaction: NPCReactionResult }>, publicEvents: Array<Pick<PublicWorldEvent, 'actor' | 'sourceIntentId'>>): number {
  if (block.waitOrigin !== 'implicit_response') return elapsedSecondsForBlock(block);
  const accepted = new Set(publicEvents.map(event => `${event.actor}\0${event.sourceIntentId}`));
  const perNpc = reactions.map(({ npcId, reaction }) => reaction.intents.filter(intent => intent.id && accepted.has(`${npcId}\0${intent.id}`)).reduce((sum, intent) => sum + getSafeIntentDuration(intent, waitPlanningSeconds(block)), 0));
  const seconds = Math.max(5, ...perNpc);
  if (!Number.isFinite(seconds) || seconds > waitPlanningSeconds(block) + 1e-6) throw new Error('Accepted NPC reply exceeds its planning ceiling');
  return seconds;
}

/** Consecutive events add time; explicitly parallel events share one window. */
export function eventsElapsedSeconds(events: GameEvent[]): number {
  if (!events.length) return 0;
  const roots = events.map((_, index) => index);
  const root = (index: number): number => roots[index] === index ? index : (roots[index] = root(roots[index]));
  const byId = new Map(events.map((event, index) => [event.id, index]));
  events.forEach((event, index) => {
    for (const partner of event.parallelWith || []) {
      const other = byId.get(partner);
      if (other !== undefined) roots[root(index)] = root(other);
    }
  });
  const windows = new Map<number, number>();
  events.forEach((event, index) => windows.set(root(index), Math.max(windows.get(root(index)) || 0, getSafeEventDuration(event))));
  return [...windows.values()].reduce((sum, value) => sum + value, 0);
}

export function elapsedSecondsForBlock(block: TemporalBlock): number {
  if (block.kind === 'admin') return 0;
  if (block.kind === 'wait' || block.kind === 'time_skip') {
    if (typeof block.duration === 'number' && Number.isFinite(block.duration) && block.duration >= 0) return block.duration;
    return block.kind === 'wait' ? 5 : 0;
  }
  return eventsElapsedSeconds(block.events || []);
}

/** Advance game clocks as UTC arithmetic; preserve the save's no-zone ISO convention. */
export function advanceClock(clock: string, seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Elapsed seconds must be finite and nonnegative');
  const noZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(clock);
  const timestamp = Date.parse(noZone ? clock + 'Z' : clock);
  if (!Number.isFinite(timestamp)) throw new Error('Game clock must be a valid ISO timestamp');
  const future = new Date(timestamp + Math.round(seconds * 1000));
  if (!Number.isFinite(future.getTime())) throw new Error('Game clock exceeds the supported timestamp range');
  const iso = future.toISOString();
  return noZone ? iso.replace(/Z$/, '').replace(/\.000$/, '') : iso;
}

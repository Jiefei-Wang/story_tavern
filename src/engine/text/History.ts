import type { GameTurn } from '../../types';
import type { RuntimeMessage } from '../runtime/AgentRuntime';

export const anchorText = (index: number) => `【时间点 ${index}】`;
// This whole-line format is reserved for program-owned metadata. Inline mentions
// of a time point remain ordinary prose. Never apply this to the user's input.
export function visibleNarration(text: string): string {
    return text.replace(/^[\t ]*【时间点 [1-9]\d*】[\t ]*(?:\r?\n|$)/gm, '').trimEnd();
}
export function anchoredNarration(text: string, anchor: number): string {
    return `${visibleNarration(text)}\n\n${anchorText(anchor)}`;
}

/** Legacy replies receive stable indices once, in the next successful transaction.
 * No source save is mutated; existing indices/request bytes are never renumbered.
 */
export function prepareHistory(source: GameTurn[]): GameTurn[] {
    const turns = structuredClone(source);
    let previous = 0;
    for (const turn of turns) {
        if (!turn.narratorOutput.trim() || turn.status === 'error') continue;
        if (turn.narration) {
            if (!Number.isSafeInteger(turn.narration.anchor) || turn.narration.anchor <= previous ||
                turn.narration.requestText !== anchoredNarration(turn.narratorOutput, turn.narration.anchor))
                throw new Error('历史时间锚点无效；未修改存档');
            previous = turn.narration.anchor;
        } else {
            turn.narration = { anchor: ++previous, requestText: anchoredNarration(turn.narratorOutput, previous) };
        }
    }
    return turns;
}

export function historyMessages(turns: GameTurn[]): RuntimeMessage[] {
    const messages: RuntimeMessage[] = [];
    for (const turn of turns) {
        // Old correction branches remain archived, with their original numbering.
        if (!turn.narration || turn.textTurn?.supersededBy) continue;
        if (turn.playerInput) messages.push({ role: 'user', content: turn.playerInput });
        messages.push({ role: 'assistant', content: turn.narration.requestText });
    }
    return messages;
}

export function characterHistory(turns: GameTurn[], id: string) {
    return turns.flatMap(turn => turn.textTurn?.supersededBy ? [] :
        (turn.textTurn?.designs || []).filter(d => d.character_id === id).map(d => ({
            anchor: turn.narration?.anchor ?? null, end_state: d.end_state,
        })));
}

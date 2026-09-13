import type { TraceSpan } from "../../types";

export function groupRequests(spans: TraceSpan[]) {
  const ordered = [...spans].sort((a, b) => a.startedAt - b.startedAt);
  const groups = ordered.filter(s => Array.isArray(s.resolvedMessages)).map(request => ({ request, validations: [] as TraceSpan[] }));
  for (const span of ordered) {
    if (!span.type.includes('validation') && span.type !== 'intent_filter') continue;
    let group = groups.find(g => g.request.id === span.parentId);
    // Older text traces did not record parentId. Their validation immediately
    // follows its request; matching output avoids attaching unrelated failures.
    if (!group && !span.parentId && span.type === 'text_validation' && span.rawResponse !== undefined) {
      group = groups.filter(g => g.request.startedAt <= span.startedAt &&
        (g.request.parsedOutput === span.rawResponse || g.request.liveContent === span.rawResponse)).at(-1);
    }
    if (group) group.validations.push(span);
  }
  return groups;
}

export function validationLabel(span: TraceSpan) {
  return `VALIDATION_OUTPUT(${span.status === 'success' ? 'success' : span.status === 'error' ? 'failed' : span.status})`;
}

export function messageText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? '';
}

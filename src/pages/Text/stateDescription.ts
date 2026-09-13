export function stateDescription(value: unknown): string {
    if (value === null || value === undefined) return '无';
    if (Array.isArray(value)) return value.map(stateDescription).join('；');
    if (typeof value !== 'object') return String(value);
    const labels: Record<string, string> = { location: '位置', mood: '情绪', memory: '记忆', relationships: '关系', knowledge: '已知信息', intention: '意向' };
    return Object.entries(value).map(([key, item]) => `${key === 'summary' ? '' : (labels[key] || key) + '：'}${stateDescription(item)}`).join('\n');
}

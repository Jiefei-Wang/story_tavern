import fs from 'node:fs';
import { BUILTIN_AGENTS } from '../src/db/initialData';
const source = JSON.parse(fs.readFileSync('artifacts/behavior-tests/group-source.json', 'utf8'));
const result = { ...source, agents: structuredClone(BUILTIN_AGENTS) };
fs.writeFileSync('artifacts/behavior-tests/unit-test-config.json', JSON.stringify(result, null, 2));
console.log('Prepared unit test configuration using current repository agents and exact persisted Fast bindings.');

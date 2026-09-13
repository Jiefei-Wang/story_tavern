import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import { validateRepositoryConfiguration, type RepositoryRecord } from '../src/db/repositoryConfiguration';

export async function readRepositoryFile(file: string): Promise<RepositoryRecord> {
  const text = await readFile(file, 'utf8');
  const data: unknown = JSON.parse(text);
  validateRepositoryConfiguration(data);
  return { data, revision: createHash('sha256').update(text).digest('hex') };
}

export async function saveRepositoryFile(file: string, data: unknown, revision: string) {
  validateRepositoryConfiguration(data);
  if ((await readRepositoryFile(file)).revision !== revision) throw new Error('仓库文件已变化，请重新载入后编辑');
  const directory = path.resolve(path.dirname(file), '../../.tmp/repository-config');
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, 'repositoryDefaults.pending');
  let created = false;
  try {
    await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
    created = true;
    if ((await readRepositoryFile(file)).revision !== revision) throw new Error('仓库文件已变化，请重新载入后编辑');
    await rename(temporary, file);
  } finally { if (created) await unlink(temporary).catch(() => {}); }
  return readRepositoryFile(file);
}

export function repositoryConfigPlugin(): Plugin {
  // ponytail: one repository file; reject concurrent writes instead of adding a queue.
  let writing = false;
  return {
    name: 'story-repository-configuration',
    configureServer(server) {
      const file = path.resolve(server.config.root, 'src/db/repositoryDefaults.json');
      server.middlewares.use('/__story_repository', async (req, res) => {
        const host = req.headers.host || '';
        if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host) ||
          (req.headers.origin && req.headers.origin !== `http://${host}`) || req.headers['x-story-local'] !== '1' ||
          (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(String(req.headers['sec-fetch-site'])))) {
          res.writeHead(403); res.end(); return;
        }
        res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
        if (!['GET', 'PUT'].includes(req.method || '')) { res.writeHead(405); res.end(); return; }
        let locked = false;
        try {
          if (req.method === 'GET') { res.end(JSON.stringify(await readRepositoryFile(file))); return; }
          if (writing) { res.writeHead(409); res.end(JSON.stringify({ error: '仓库正在保存，请稍后重试' })); return; }
          writing = true; locked = true;
          const chunks: Buffer[] = []; let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 2 * 1024 * 1024) throw new Error('仓库配置超过 2 MB');
            chunks.push(Buffer.from(chunk));
          }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (req.aborted) return;
          res.end(JSON.stringify(await saveRepositoryFile(file, body.data, body.revision)));
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : '仓库读写失败' }));
        } finally { if (locked) writing = false; }
      });
    },
    handleHotUpdate(context) {
      // Saving defaults must not reload the game and discard unsaved progress.
      if (context.file === path.resolve(context.server.config.root, 'src/db/repositoryDefaults.json')) return [];
    },
  };
}

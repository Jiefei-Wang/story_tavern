import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import type { Plugin, ViteDevServer, PreviewServer } from 'vite';

export function localServicePlugin(): Plugin {
  let stop: (() => void) | undefined;
  const install = (server: ViteDevServer | PreviewServer) => {
    const token = randomUUID();
    const child = spawn('cargo', ['run', '--quiet', '--manifest-path', path.resolve('src-tauri/Cargo.toml'), '--bin', 'storage_server', ...(process.env.STORY_TAVERN_TEST_DIR ? ['--', '--data-dir', process.env.STORY_TAVERN_TEST_DIR] : [])], {
      cwd: process.cwd(), env: { ...process.env, STORY_TAVERN_BRIDGE_TOKEN: token }, windowsHide: true, stdio: ['pipe','pipe','pipe'],
    });
    let port = 0, failure = '', buffer = '';
    let resolveReady!: () => void;
    const ready = new Promise<void>(resolve => { resolveReady = resolve; });
    child.stdout.on('data', chunk => { buffer += chunk.toString(); const at = buffer.indexOf('\n'); if (at >= 0 && !port) { try { port = JSON.parse(buffer.slice(0,at)).port; resolveReady(); } catch { failure = '本地服务启动返回无效'; resolveReady(); } } });
    child.stderr.on('data', chunk => { process.stderr.write(chunk); });
    child.on('error', () => { failure = '无法启动本地存储服务，请检查 Rust/Cargo 安装'; resolveReady(); });
    child.on('exit', code => { failure = `本地存储服务已停止 (${code})`; resolveReady(); });
    stop = () => { child.stdin.end(); child.kill(); };
    server.httpServer?.once('close', () => stop?.());
    server.middlewares.use('/__story_local/rpc', async (req, res) => {
      // Private loopback host, exact Origin, and non-simple header prevent cross-site writes.
      const host = req.headers.host || '';
      const origin = req.headers.origin;
      if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host) || (origin && origin !== `http://${host}`) || req.headers['x-story-local'] !== '1' || (req.headers['sec-fetch-site'] && !['same-origin','none'].includes(String(req.headers['sec-fetch-site'])))) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
      await ready;
      if (failure || !port) { res.writeHead(503, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:failure || '本地服务未就绪'})); return; }
      const chunks: Buffer[] = []; let size = 0;
      try { for await (const chunk of req) { size += chunk.length; if (size > 64 * 1024 * 1024) { res.writeHead(413); res.end(); return; } chunks.push(Buffer.from(chunk)); } }
      catch { res.destroy(); return; }
      const body = Buffer.concat(chunks);
      const upstream = http.request({ host:'127.0.0.1', port, path:'/rpc', method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Content-Length':body.length} }, response => {
        res.writeHead(response.statusCode || 502, {'Content-Type':'application/x-ndjson','Cache-Control':'no-store'});
        response.pipe(res);
      });
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(JSON.stringify({error:'本地服务连接中断'})); });
      res.once('close', () => upstream.destroy()); upstream.end(body);
    });
  };
  return { name:'story-local-service', configureServer:install, configurePreviewServer:install, closeBundle:() => stop?.() };
}

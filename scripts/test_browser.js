async function test() {
  const r = await fetch('http://localhost:5173/src/main.tsx');
  console.log('main.tsx status:', r.status);
  const text = await r.text();

  const visited = new Set();
  const queue = ['/src/main.tsx'];

  while (queue.length > 0) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);

    const url = file.startsWith('http') ? file : 'http://localhost:5173' + file;
    try {
      const res = await fetch(url);
      if (res.status !== 200) {
        console.error('FAILED HTTP ' + res.status + ': ' + file);
        const errText = await res.text();
        console.error(errText.slice(0, 500));
        continue;
      }
      const body = await res.text();
      // find imports
      const importRegex = /from\s+["']([^"']+)["']/g;
      let m;
      while ((m = importRegex.exec(body)) !== null) {
        let target = m[1];
        if (target.startsWith('.')) {
          // relative
          const base = file.substring(0, file.lastIndexOf('/'));
          const parts = (base + '/' + target).split('/');
          const resolved = [];
          for (const p of parts) {
            if (p === '.' || !p) continue;
            if (p === '..') resolved.pop();
            else resolved.push(p);
          }
          target = '/' + resolved.join('/');
        }
        if (!visited.has(target) && (target.startsWith('/') || target.startsWith('http'))) {
          queue.push(target);
        }
      }
    } catch (e) {
      console.error('FETCH ERROR: ' + file, e.message);
    }
  }
  console.log('Visited ' + visited.size + ' modules. Finished scan.');
}

test();

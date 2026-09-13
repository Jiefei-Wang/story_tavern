"""Copy only existing application/model configuration into an isolated desktop test DB."""
import os, sqlite3, pathlib, json, sys
root = pathlib.Path(__file__).resolve().parents[1]
controlled = '--controlled' in sys.argv
target_dir = root / '.tmp' / ('text-native-controlled' if controlled else 'text-native')
target_dir.mkdir(parents=True, exist_ok=True)
source_path = pathlib.Path(os.environ['APPDATA']) / 'story_tavern' / 'story_tavern.db'
source = sqlite3.connect(source_path.as_uri() + '?mode=ro', uri=True)
target = sqlite3.connect(target_dir / 'story_tavern.db')
for table in ['backends', 'agents', 'agent_groups']:
    schema = source.execute('SELECT sql FROM sqlite_master WHERE type=? AND name=?', ('table', table)).fetchone()[0]
    target.execute(schema.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS', 1))
    rows = source.execute(f'SELECT id,data,updated_at FROM {table}').fetchall()
    if controlled and table == 'backends':
        converted=[]
        for key,data,updated in rows:
            value=json.loads(data)
            value.update(baseUrl='http://127.0.0.1:4180/v1',authType='none',customHeaders={},enabled=True,timeoutMs=10000)
            value.pop('secretRef',None)
            converted.append((key,json.dumps(value),updated))
        rows=converted
    target.executemany(f'INSERT OR IGNORE INTO {table}(id,data,updated_at) VALUES(?,?,?)', rows)
target.commit()
source.close()
target.close()
print('Isolated application configuration prepared; user saves and credentials unchanged.')

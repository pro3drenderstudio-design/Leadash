"""
Kill whatever is blocking ALTER TABLE on discover_companies, then add keywords column.
"""
import paramiko, time

HOST = "89.117.51.235"
USER = "root"
PASS = "M6161505c"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=30)

def q(sql, timeout=30):
    _, out, err = client.exec_command(
        f"sudo -u postgres psql -d leadash_leads -c \"{sql}\"", timeout=timeout
    )
    o = out.read().decode(errors="replace")
    e = err.read().decode(errors="replace")
    return (o + e).strip()

def run(cmd, timeout=15):
    _, out, err = client.exec_command(cmd, timeout=timeout)
    o = out.read().decode(errors="replace")
    e = err.read().decode(errors="replace")
    return (o + e).strip()

print("=== active queries on discover_companies ===")
print(q("""
SELECT pid, state, wait_event_type, wait_event, query_start,
       LEFT(query, 120) AS query
FROM pg_stat_activity
WHERE state != 'idle'
  AND query NOT LIKE '%pg_stat_activity%'
ORDER BY query_start
"""))

print("\n=== idle transactions (potential lock holders) ===")
print(q("""
SELECT pid, state, wait_event_type, query_start, xact_start,
       LEFT(query, 80) AS last_query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
ORDER BY xact_start
"""))

print("\n=== locks on discover_companies ===")
print(q("""
SELECT l.pid, l.granted, l.mode, a.state, a.query_start,
       LEFT(a.query, 80) AS query
FROM pg_locks l
JOIN pg_class c ON c.oid = l.relation
JOIN pg_stat_activity a ON a.pid = l.pid
WHERE c.relname = 'discover_companies'
ORDER BY l.granted DESC, a.query_start
"""))

print("\n=== killing idle-in-transaction sessions ===")
print(q("""
SELECT pg_terminate_backend(pid), pid, state, LEFT(query, 60) AS q
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND xact_start < NOW() - INTERVAL '5 seconds'
"""))

print("\n=== killing any non-idle queries holding locks on discover_companies ===")
print(q("""
SELECT pg_terminate_backend(l.pid), l.pid, l.mode, LEFT(a.query, 60) AS q
FROM pg_locks l
JOIN pg_class c ON c.oid = l.relation
JOIN pg_stat_activity a ON a.pid = l.pid
WHERE c.relname = 'discover_companies'
  AND l.granted = true
  AND a.pid != pg_backend_pid()
"""))

print("\nWaiting 3s for locks to clear...")
time.sleep(3)

print("\n=== ALTER TABLE discover_companies ADD COLUMN IF NOT EXISTS keywords text ===")
r = q("ALTER TABLE discover_companies ADD COLUMN IF NOT EXISTS keywords text", timeout=60)
print(r or "(no output — may have timed out)")

print("\n=== verify columns ===")
print(q("SELECT column_name FROM information_schema.columns WHERE table_name='discover_companies' AND column_name IN ('description','keywords')"))

print("\n=== row counts ===")
print(q("SELECT COUNT(*) FROM discover_companies"))

client.close()

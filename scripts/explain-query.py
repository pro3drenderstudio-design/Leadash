import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("89.117.51.235", username="root", password="M6161505c", timeout=15)
DB = "postgresql://leadash_user:U7Guy7DRejBVYctiz09qAajNvCKWr6zPrvdM9NR22T0@localhost/leadash_leads"

# Default query: has_email, sort by created_at DESC, first page
queries = [
    ("COUNT with has_email", """
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT COUNT(*) AS total
FROM discover_people p
LEFT JOIN discover_companies c ON c.id = p.company_id
WHERE p.email IS NOT NULL AND p.email <> ''
"""),
    ("DATA with has_email", """
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT p.id, p.first_name, p.last_name, p.title, p.country
FROM discover_people p
LEFT JOIN discover_companies c ON c.id = p.company_id
WHERE p.email IS NOT NULL AND p.email <> ''
ORDER BY p.created_at DESC NULLS LAST
LIMIT 25
"""),
    ("Count existing indexes", """
SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass)) as size
FROM pg_indexes WHERE tablename='discover_people' ORDER BY indexname
"""),
]

for label, sql in queries:
    print(f"\n{'='*60}")
    print(f"=== {label} ===")
    cmd = f'psql "{DB}" -c "{sql.strip()}"'
    stdin, stdout, stderr = client.exec_command(cmd, timeout=120)
    stdout.channel.settimeout(120)
    print(stdout.read().decode()[:3000])
    err = stderr.read().decode()
    if err: print("ERR:", err[:200])

client.close()

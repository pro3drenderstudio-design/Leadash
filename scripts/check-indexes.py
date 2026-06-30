import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("89.117.51.235", username="root", password="M6161505c", timeout=15)
DB = "postgresql://leadash_user:U7Guy7DRejBVYctiz09qAajNvCKWr6zPrvdM9NR22T0@localhost/leadash_leads"

for query, label in [
    ("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'discover_people' ORDER BY indexname", "discover_people indexes"),
    ("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'discover_companies' ORDER BY indexname", "discover_companies indexes"),
    ("SELECT schemaname, tablename, attname, n_distinct, correlation FROM pg_stats WHERE tablename='discover_people' AND attname IN ('country','email','title','seniority','department','company_name') ORDER BY attname", "discover_people stats"),
]:
    cmd = f'psql "{DB}" -t -A -c "{query}"'
    stdin, stdout, stderr = client.exec_command(cmd, timeout=30)
    print(f"\n=== {label} ===")
    print(stdout.read().decode())

client.close()

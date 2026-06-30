import paramiko, time

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("89.117.51.235", username="root", password="M6161505c", timeout=15)

# Run as postgres superuser via sudo
indexes = [
    "CREATE EXTENSION IF NOT EXISTS pg_trgm",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS discover_people_title_trgm ON discover_people USING gin (title gin_trgm_ops)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS discover_people_company_name_trgm ON discover_people USING gin (company_name gin_trgm_ops)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS discover_people_country_lower_idx ON discover_people (lower(country))",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS discover_companies_country_lower_idx ON discover_companies (lower(country))",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS discover_companies_industry_trgm ON discover_companies USING gin (industry gin_trgm_ops)",
]

for sql in indexes:
    print(f"\n>>> {sql[:80]}...")
    cmd = f'sudo -u postgres psql -d leadash_leads -c "{sql}"'
    stdin, stdout, stderr = client.exec_command(cmd, timeout=600)
    stdout.channel.settimeout(600)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out: print(out.strip())
    if err and "ERROR" in err: print("ERR:", err[:200])
    time.sleep(1)

client.close()
print("\nAll done.")

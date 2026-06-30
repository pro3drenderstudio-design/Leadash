import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("89.117.51.235", username="root", password="M6161505c", timeout=15)

# First check if indexes already exist or are being built
stdin, stdout, stderr = client.exec_command(
    "sudo -u postgres psql -d leadash_leads -c \"SELECT indexname, phase, blocks_done, blocks_total FROM pg_stat_progress_create_index;\"",
    timeout=15
)
print("=== In-progress indexes ===")
print(stdout.read().decode())

stdin, stdout, stderr = client.exec_command(
    "sudo -u postgres psql -d leadash_leads -t -A -c \"SELECT indexname FROM pg_indexes WHERE tablename='discover_people' AND indexname LIKE '%trgm%'\"",
    timeout=15
)
print("=== Existing trgm indexes ===")
print(stdout.read().decode().strip() or "(none)")

# Run each index in its own screen session so they survive SSH disconnect
cmds = [
    ("title_trgm",       "CREATE INDEX CONCURRENTLY IF NOT EXISTS discover_people_title_trgm ON discover_people USING gin (title gin_trgm_ops)"),
    ("co_name_trgm",     "CREATE INDEX CONCURRENTLY IF NOT EXISTS discover_people_company_name_trgm ON discover_people USING gin (company_name gin_trgm_ops)"),
    ("country_lower",    "CREATE INDEX CONCURRENTLY IF NOT EXISTS discover_people_country_lower_idx ON discover_people (lower(country))"),
    ("co_country_lower", "CREATE INDEX CONCURRENTLY IF NOT EXISTS discover_companies_country_lower_idx ON discover_companies (lower(country))"),
    ("co_industry_trgm", "CREATE INDEX CONCURRENTLY IF NOT EXISTS discover_companies_industry_trgm ON discover_companies USING gin (industry gin_trgm_ops)"),
]

for name, sql in cmds:
    cmd = f'screen -dmS idx_{name} bash -c \'sudo -u postgres psql -d leadash_leads -c "{sql}" > /tmp/idx_{name}.log 2>&1\''
    stdin, stdout, stderr = client.exec_command(cmd, timeout=10)
    stdout.read(); stderr.read()
    print(f"Started screen session: idx_{name}")

# Show all running screen sessions
stdin, stdout, stderr = client.exec_command("screen -ls", timeout=10)
print("\n=== Screen sessions ===")
print(stdout.read().decode())

client.close()

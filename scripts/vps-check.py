import paramiko, time

HOST = "89.117.51.235"
USER = "root"
PASS = "M6161505c"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=30)

def run(cmd, timeout=30):
    _, out, err = client.exec_command(cmd, timeout=timeout)
    o = out.read().decode()
    e = err.read().decode()
    return (o + e).strip()

# 1. Kill backfill processes
print("=== killing backfills ===")
print(run("pkill -f backfill-desc-keywords 2>/dev/null; pkill -f backfill-linkedin 2>/dev/null; echo 'kill sent'"))

time.sleep(2)

# 2. Add keywords column
print("\n=== adding keywords column ===")
print(run("sudo -u postgres psql -d leadash_leads -c 'ALTER TABLE discover_companies ADD COLUMN IF NOT EXISTS keywords text;'"))

# 3. Check all running python processes
print("\n=== running python processes ===")
print(run("ps aux | grep python3 | grep -v grep"))

# 4. Check apollo people import specifically
print("\n=== apollo people import status ===")
print(run("cat /data/apollo/checkpoint-people.json 2>/dev/null || echo 'no checkpoint'"))

# 5. Check if import-apollo.py is running
print("\n=== import-apollo process ===")
print(run("pgrep -a -f import-apollo || echo 'NOT running'"))

# 6. Column check
print("\n=== discover_companies columns ===")
print(run("sudo -u postgres psql -d leadash_leads -c \"SELECT column_name FROM information_schema.columns WHERE table_name='discover_companies' ORDER BY ordinal_position;\""))

# 7. Quick people count
print("\n=== people/companies counts ===")
print(run("sudo -u postgres psql -d leadash_leads -c 'SELECT (SELECT COUNT(*) FROM discover_people) as people, (SELECT COUNT(*) FROM discover_companies) as companies;'"))

client.close()

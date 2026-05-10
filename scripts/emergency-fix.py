import paramiko

HOST = "89.117.51.235"
USER = "root"
PASS = "M6161505c"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=20)

def q(sql):
    _, out, _ = client.exec_command(f"sudo -u postgres psql -d leadash_leads -c \"{sql}\"")
    return out.read().decode()

def run(cmd):
    _, out, err = client.exec_command(cmd)
    return out.read().decode() + err.read().decode()

print("=== killing backfill processes ===")
print(run("pkill -f backfill-desc-keywords || echo 'none running'"))
print(run("pkill -f backfill-linkedin || echo 'none running'"))

print("=== adding keywords column ===")
print(q("ALTER TABLE discover_companies ADD COLUMN IF NOT EXISTS keywords text"))

print("=== verify columns ===")
print(q("SELECT column_name FROM information_schema.columns WHERE table_name='discover_companies' ORDER BY ordinal_position"))

print("=== test people query ===")
print(q("SELECT p.id, p.first_name, p.last_name, c.keywords FROM discover_people p LEFT JOIN discover_companies c ON c.id = p.company_id WHERE p.email IS NOT NULL LIMIT 3"))

client.close()
print("\nDone. Refresh the page — leads should load now.")

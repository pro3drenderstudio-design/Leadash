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

print("=== backfill process ===")
print(run("pgrep -a -f backfill-desc"))

print("=== add keywords column ===")
print(q("ALTER TABLE discover_companies ADD COLUMN IF NOT EXISTS keywords text"))

print("=== column check ===")
print(q("SELECT column_name FROM information_schema.columns WHERE table_name='discover_companies' AND column_name IN ('description','keywords')"))

print("=== quick test query ===")
print(q("SELECT id, name, description, keywords FROM discover_companies LIMIT 3"))

client.close()

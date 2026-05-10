import paramiko, time

HOST = "89.117.51.235"
USER = "root"
PASS = "M6161505c"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=30)

def run(cmd, timeout=15):
    chan = client.get_transport().open_session()
    chan.settimeout(timeout)
    chan.exec_command(cmd)
    out = b""
    while True:
        try:
            chunk = chan.recv(4096)
            if not chunk:
                break
            out += chunk
        except Exception:
            break
    chan.close()
    return out.decode(errors="replace")

print("killing backfills + import-apollo...")
run("pkill -9 -f backfill-desc-keywords; pkill -9 -f backfill-linkedin; echo done", timeout=10)
time.sleep(3)

print("running python3 processes:")
print(run("ps aux | grep python3 | grep -v grep", timeout=10))

print("\napollo people checkpoint:")
print(run("cat /data/apollo/checkpoint-people.json", timeout=10))

print("\napollo orgs checkpoint:")
print(run("cat /data/apollo/checkpoint-orgs.json 2>/dev/null || echo none", timeout=10))

print("\nadding keywords column...")
r = run("sudo -u postgres psql -d leadash_leads -c \"SET lock_timeout='60s'; ALTER TABLE discover_companies ADD COLUMN IF NOT EXISTS keywords text;\"", timeout=90)
print(r or "(no output)")

print("\ncolumns:")
print(run("sudo -u postgres psql -d leadash_leads -c \"SELECT column_name FROM information_schema.columns WHERE table_name='discover_companies' ORDER BY ordinal_position;\"", timeout=30))

print("\ncounts:")
print(run("sudo -u postgres psql -d leadash_leads -c \"SELECT (SELECT COUNT(*) FROM discover_people) people, (SELECT COUNT(*) FROM discover_companies) companies;\"", timeout=30))

client.close()

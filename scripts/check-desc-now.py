import paramiko, time
HOST = "89.117.51.235"; USER = "root"; PASS = "M6161505c"
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=20)
def run(cmd):
    _, out, _ = client.exec_command(cmd)
    return out.read().decode()
print(run("tail -20 /data/backfill-desc.log"))
print(run('sudo -u postgres psql -d leadash_leads -c "SELECT COUNT(*) total, COUNT(description) with_desc, COUNT(keywords) with_kw FROM discover_companies;"'))
client.close()

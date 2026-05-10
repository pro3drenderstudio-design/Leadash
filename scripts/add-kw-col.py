import paramiko
HOST = "89.117.51.235"; USER = "root"; PASS = "M6161505c"
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=20)
_, out, err = client.exec_command(
    'sudo -u postgres psql -d leadash_leads -c "ALTER TABLE discover_companies ADD COLUMN IF NOT EXISTS keywords text;"'
)
print("stdout:", out.read().decode())
print("stderr:", err.read().decode())
_, out2, _ = client.exec_command(
    'sudo -u postgres psql -d leadash_leads -c "\\d discover_companies" | grep keywords'
)
print("col exists:", out2.read().decode())
client.close()

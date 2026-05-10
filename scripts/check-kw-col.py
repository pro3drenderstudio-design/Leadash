import paramiko
HOST = "89.117.51.235"; USER = "root"; PASS = "M6161505c"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=20)
def q(sql):
    _, o, _ = c.exec_command(f'sudo -u postgres psql -d leadash_leads -c "{sql}"')
    return o.read().decode()
print(q("SELECT column_name FROM information_schema.columns WHERE table_name='discover_companies' AND column_name='keywords';"))
print(q("SELECT COUNT(*) FROM discover_companies WHERE keywords IS NOT NULL;"))
c.close()

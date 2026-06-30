import paramiko, sys

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("89.117.51.235", username="root", password="M6161505c", timeout=20)

cmds = [
    "ls -lh /data/apollo/",
    "wc -l /data/apollo/apollo_people.csv",
    "wc -l /data/apollo/apollo_orgs.csv",
]

for cmd in cmds:
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    print(f"$ {cmd}")
    if out: print(out)
    if err: print("ERR:", err)
    print()

client.close()

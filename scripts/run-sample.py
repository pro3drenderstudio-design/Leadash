"""Copies sample-cols.py to VPS via SFTP and runs it."""
import paramiko

HOST = "89.117.51.235"
USER = "root"
PASS = "M6161505c"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=20)

# Upload the script
sftp = client.open_sftp()
sftp.put("scripts/sample-cols.py", "/data/sample-cols.py")
sftp.close()

# Run it
_, out, err = client.exec_command("python3 /data/sample-cols.py", timeout=120)
print(out.read().decode())
e = err.read().decode()
if e:
    print("STDERR:", e)

client.close()

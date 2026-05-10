"""Upload and launch backfill-desc-keywords.py on the VPS in a screen session."""
import paramiko

HOST = "89.117.51.235"
USER = "root"
PASS = "M6161505c"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=20)

sftp = client.open_sftp()
sftp.put("scripts/backfill-desc-keywords.py", "/data/backfill-desc-keywords.py")
sftp.close()
print("Uploaded backfill-desc-keywords.py")

# Run in background via nohup
_, out, err = client.exec_command(
    "nohup python3 /data/backfill-desc-keywords.py > /data/backfill-desc.log 2>&1 &"
)
out.read(); err.read()

# Get PID
_, out2, _ = client.exec_command("pgrep -f backfill-desc-keywords")
pid = out2.read().decode().strip()
print(f"Started PID: {pid}")
print("Tail logs: tail -f /data/backfill-desc.log")

client.close()

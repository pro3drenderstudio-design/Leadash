"""Open port 5432 to all IPs (Vercel uses dynamic IPs — can't whitelist)
and update pg_hba.conf to accept all remote connections with password auth.
"""
import paramiko, time

HOST = "89.117.51.235"
USER = "root"
PASS = "M6161505c"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=15)

def run(cmd, timeout=30):
    chan = client.get_transport().open_session()
    chan.exec_command(cmd)
    chan.shutdown_write()
    out = b""; err = b""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if chan.recv_ready(): out += chan.recv(65536)
        if chan.recv_stderr_ready(): err += chan.recv_stderr(65536)
        if chan.exit_status_ready():
            while chan.recv_ready(): out += chan.recv(65536)
            while chan.recv_stderr_ready(): err += chan.recv_stderr(65536)
            break
        time.sleep(0.3)
    return out.decode("utf-8", errors="replace"), err.decode("utf-8", errors="replace")

print("Opening port 5432 to all IPs...")
o, e = run("ufw allow 5432/tcp")
print(o.strip() or e.strip())

# Update pg_hba.conf — replace the specific-IP rule with all hosts
o, e = run("grep -n 'leadash' /etc/postgresql/16/main/pg_hba.conf")
print("Current pg_hba entry:", o.strip())

# Replace the restrictive entry with a open one (scram-sha-256 still required)
o, e = run(r"sed -i 's|host leadash_leads leadash_user all scram-sha-256|host leadash_leads leadash_user 0.0.0.0/0 scram-sha-256|' /etc/postgresql/16/main/pg_hba.conf")

# Verify
o, e = run("grep 'leadash' /etc/postgresql/16/main/pg_hba.conf")
print("Updated pg_hba entry:", o.strip())

# Reload PostgreSQL to apply
o, e = run("systemctl reload postgresql")
print("PostgreSQL reloaded:", "ok" if not e.strip() else e.strip())

# Show firewall status
o, e = run("ufw status")
print("\nFirewall status:\n" + o)

client.close()
print("Done. Port 5432 open to all IPs with password auth.")

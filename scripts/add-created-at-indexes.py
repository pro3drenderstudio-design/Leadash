import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("89.117.51.235", username="root", password="M6161505c", timeout=15)

# These are the critical indexes. Run each in its own screen session.
indexes = [
    # Most important: allows ORDER BY created_at on has_email rows without seq scan
    ("created_email", "CREATE INDEX CONCURRENTLY IF NOT EXISTS discover_people_created_email_idx ON discover_people (created_at DESC NULLS LAST) WHERE email IS NOT NULL AND email <> ''"),
    # Fallback for email_status=any
    ("created_all",   "CREATE INDEX CONCURRENTLY IF NOT EXISTS discover_people_created_idx ON discover_people (created_at DESC NULLS LAST)"),
]

for name, sql in indexes:
    cmd = f'screen -dmS cidx_{name} bash -c \'sudo -u postgres psql -d leadash_leads -c "{sql}" > /tmp/cidx_{name}.log 2>&1; echo done >> /tmp/cidx_{name}.log\''
    stdin, stdout, stderr = client.exec_command(cmd, timeout=10)
    stdout.read(); stderr.read()
    print(f"Started: cidx_{name}")

stdin, stdout, stderr = client.exec_command("screen -ls | grep cidx", timeout=10)
print(stdout.read().decode())
client.close()

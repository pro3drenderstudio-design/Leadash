import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("89.117.51.235", username="root", password="M6161505c", timeout=15)

DB = "postgresql://leadash_user:U7Guy7DRejBVYctiz09qAajNvCKWr6zPrvdM9NR22T0@localhost/leadash_leads"

cmd = f'psql "{DB}" -t -A -c "SELECT country, COUNT(*) as cnt FROM discover_people WHERE country IS NOT NULL AND country != \'\' GROUP BY country ORDER BY cnt DESC LIMIT 100;"'

stdin, stdout, stderr = client.exec_command(cmd, timeout=60)
print(stdout.read().decode())
err = stderr.read().decode()
if err:
    print("ERR:", err[:300])

client.close()

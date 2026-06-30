import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("89.117.51.235", username="root", password="M6161505c", timeout=15)

stdin, stdout, stderr = client.exec_command("kill -STOP 137533 && echo 'paused' && ps -p 137533 -o pid,stat,comm", timeout=10)
print(stdout.read().decode())
print(stderr.read().decode())
client.close()

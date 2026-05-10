import paramiko

HOST = "89.117.51.235"
USER = "root"
PASS = "M6161505c"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=20)

def q(sql):
    _, out, _ = client.exec_command(f"sudo -u postgres psql -d leadash_leads -c \"{sql}\"")
    return out.read().decode()

print("=== SENIORITY ===")
print(q("SELECT seniority, COUNT(*) n FROM discover_people WHERE seniority IS NOT NULL GROUP BY seniority ORDER BY n DESC;"))

print("=== DEPARTMENT ===")
print(q("SELECT department, COUNT(*) n FROM discover_people WHERE department IS NOT NULL GROUP BY department ORDER BY n DESC LIMIT 40;"))

print("=== TOP INDUSTRIES (companies) ===")
print(q("SELECT industry, COUNT(*) n FROM discover_companies WHERE industry IS NOT NULL GROUP BY industry ORDER BY n DESC LIMIT 60;"))

print("=== TOP COUNTRIES (people) ===")
print(q("SELECT country, COUNT(*) n FROM discover_people WHERE country IS NOT NULL GROUP BY country ORDER BY n DESC LIMIT 40;"))

print("=== TOP COUNTRIES (companies) ===")
print(q("SELECT country, COUNT(*) n FROM discover_companies WHERE country IS NOT NULL GROUP BY country ORDER BY n DESC LIMIT 30;"))

print("=== FUNDING STAGES ===")
print(q("SELECT funding_stage, COUNT(*) n FROM discover_companies WHERE funding_stage IS NOT NULL GROUP BY funding_stage ORDER BY n DESC;"))

client.close()

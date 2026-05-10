"""Run on local machine — SSHes into VPS to sample description/keyword CSV columns."""
import paramiko

HOST = "89.117.51.235"
USER = "root"
PASS = "M6161505c"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=20)

def run(cmd):
    _, out, err = client.exec_command(cmd)
    return out.read().decode()

# Sample the key columns from the CSV (skip header, print first 15 non-empty rows for each col)
script = """
import csv, sys
csv.field_size_limit(sys.maxsize)

COLS = {
    9:  'relevant_keywords',
    10: 'relevant_keywords_str',
    12: 'linkedin_specialties',
    15: 'keywords',
    19: 'short_description',
    20: 'seo_description',
}

samples = {k: [] for k in COLS}

with open('/data/apollo/apollo_orgs.csv', encoding='utf-8', errors='replace') as f:
    reader = csv.reader(f, delimiter='\\t')
    next(reader)  # skip header
    for row in reader:
        done = all(len(samples[k]) >= 8 for k in COLS)
        if done:
            break
        for col, name in COLS.items():
            if len(samples[col]) < 8:
                val = row[col].strip() if len(row) > col else ''
                if val and val not in ('[]', '[\\'\\']', 'None'):
                    samples[col].append(val[:150])

for col, name in COLS.items():
    print(f'\\n=== col {col}: {name} ===')
    for s in samples[col]:
        print(f'  {repr(s)}')
"""

result = run(f"python3 -c {repr(script)}")
print(result)
client.close()

"""
Check: (1) what columns are in the Apollo orgs CSV header, (2) current discover_companies schema.
Run on VPS: python3 /data/check-apollo-cols.py
"""
import csv, sys, psycopg2
csv.field_size_limit(sys.maxsize)

DSN = "host=localhost port=5432 dbname=leadash_leads user=leadash_user password='U7Guy7DRejBVYctiz09qAajNvCKWr6zPrvdM9NR22T0'"
CSV_PATH = "/data/apollo/apollo_orgs.csv"

print("=== CSV HEADERS (index: name) ===")
with open(CSV_PATH, encoding="utf-8", errors="replace") as f:
    reader = csv.reader(f, delimiter="\t")
    headers = next(reader)
    for i, h in enumerate(headers):
        print(f"  {i:>3}: {h}")

print("\n=== discover_companies COLUMNS ===")
conn = psycopg2.connect(DSN)
cur = conn.cursor()
cur.execute("""
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'discover_companies'
    ORDER BY ordinal_position
""")
for col, dtype in cur.fetchall():
    print(f"  {col:<30} {dtype}")

print("\n=== description/keywords sample (first 3 non-null) ===")
# We'll check these after seeing the headers
cur.close()
conn.close()

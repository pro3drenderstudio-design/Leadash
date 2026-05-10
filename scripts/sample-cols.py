"""Run directly on VPS: python3 /data/sample-cols.py"""
import csv, sys
csv.field_size_limit(sys.maxsize)

COLS = {
    9:  "relevant_keywords",
    10: "relevant_keywords_str",
    12: "linkedin_specialties",
    15: "keywords",
    19: "short_description",
    20: "seo_description",
}

samples = {k: [] for k in COLS}

with open("/data/apollo/apollo_orgs.csv", encoding="utf-8", errors="replace") as f:
    reader = csv.reader(f, delimiter="\t")
    next(reader)  # skip header
    for row in reader:
        done = all(len(samples[k]) >= 8 for k in COLS)
        if done:
            break
        for col in COLS:
            if len(samples[col]) < 8:
                val = row[col].strip() if len(row) > col else ""
                if val and val not in ("[]", "['']", "None"):
                    samples[col].append(val[:150])

for col, name in COLS.items():
    print(f"\n=== col {col}: {name} ===")
    for s in samples[col]:
        print(f"  {repr(s)}")

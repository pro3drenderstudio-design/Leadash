with open('/data/import-apollo.py', 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Fix 1: truncate long fields before batch.append in orgs section
OLD1 = """            batch.append((
                name, domain, website, industry, size, employees,
                country, state, city, revenue, funding, fund_stage,
                "apollo", source_id
            ))"""

NEW1 = """            name    = (name    or "")[:500]
            domain  = (domain  or "")[:500]
            website = (website or "")[:1000]
            batch.append((
                name, domain, website, industry, size, employees,
                country, state, city, revenue, funding, fund_stage,
                "apollo", source_id
            ))"""

if OLD1 in content:
    content = content.replace(OLD1, NEW1, 1)
    print("Fix 1 applied: field truncation")
else:
    print("WARNING: Fix 1 pattern not found")

# Fix 2: wrap orgs batch execute_values in try/except
OLD2 = """            if len(batch) >= BATCH_SIZE:
                psycopg2.extras.execute_values(cur, \"\"\"
                    INSERT INTO discover_companies
                        (name, domain, website_url, industry, size_range, employee_count,
                         country, state, city, revenue_usd, funding_total, funding_stage,
                         source, source_id)
                    VALUES %s
                    ON CONFLICT DO NOTHING
                \"\"\", batch)
                conn.commit()
                total_inserted += len(batch)
                batch.clear()"""

NEW2 = """            if len(batch) >= BATCH_SIZE:
                try:
                    psycopg2.extras.execute_values(cur, \"\"\"
                        INSERT INTO discover_companies
                            (name, domain, website_url, industry, size_range, employee_count,
                             country, state, city, revenue_usd, funding_total, funding_stage,
                             source, source_id)
                        VALUES %s
                        ON CONFLICT DO NOTHING
                    \"\"\", batch)
                    conn.commit()
                    total_inserted += len(batch)
                except Exception as _e:
                    conn.rollback()
                    for _row in batch:
                        try:
                            psycopg2.extras.execute_values(cur, \"\"\"
                                INSERT INTO discover_companies
                                    (name, domain, website_url, industry, size_range, employee_count,
                                     country, state, city, revenue_usd, funding_total, funding_stage,
                                     source, source_id)
                                VALUES %s ON CONFLICT DO NOTHING
                            \"\"\", [_row])
                            conn.commit()
                            total_inserted += 1
                        except Exception:
                            conn.rollback()
                            total_skipped += 1
                batch.clear()"""

if OLD2 in content:
    content = content.replace(OLD2, NEW2, 1)
    print("Fix 2 applied: batch try/except fallback")
else:
    print("WARNING: Fix 2 pattern not found")

with open('/data/import-apollo.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done")

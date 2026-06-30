with open('/data/linkedin-import.py', 'r', encoding='utf-8') as f:
    content = f.read()

OLD = (
    '    if insert_batch:\n'
    '        execute_values(cur, INSERT_SQL, [\n'
    '            (\n'
    '                str(uuid.uuid4()),\n'
    '                r["first_name"], r["last_name"], r["title"], r["sub_role"],\n'
    '                r["gender"], r["birth_year"], r["skills"], r["summary"],\n'
    '                r["job_summary"], r["inferred_salary"], r["years_experience"],\n'
    '                r["linkedin_connections"], r["email"], r["phone"], r["linkedin_url"],\n'
    '                r["country"], r["state"], r["city"], r["company_name"],\n'
    '                r["facebook_url"], r["twitter_url"], r["github_url"],\n'
    '                r["interests"], r["start_date"], "linkedin",\n'
    '            )\n'
    '            for r in insert_batch\n'
    '        ])\n'
    '        stats["inserted"] += len(insert_batch)\n'
    '        insert_batch.clear()'
)

NEW = (
    '    if insert_batch:\n'
    '        seen = set()\n'
    '        deduped = []\n'
    '        for r in insert_batch:\n'
    '            key = (r.get("email") or "").lower() or (r.get("linkedin_url") or "").lower()\n'
    '            if key and key not in seen:\n'
    '                seen.add(key)\n'
    '                deduped.append(r)\n'
    '        if deduped:\n'
    '            execute_values(cur, INSERT_SQL, [\n'
    '                (\n'
    '                    str(uuid.uuid4()),\n'
    '                    r["first_name"], r["last_name"], r["title"], r["sub_role"],\n'
    '                    r["gender"], r["birth_year"], r["skills"], r["summary"],\n'
    '                    r["job_summary"], r["inferred_salary"], r["years_experience"],\n'
    '                    r["linkedin_connections"], r["email"], r["phone"], r["linkedin_url"],\n'
    '                    r["country"], r["state"], r["city"], r["company_name"],\n'
    '                    r["facebook_url"], r["twitter_url"], r["github_url"],\n'
    '                    r["interests"], r["start_date"], "linkedin",\n'
    '                )\n'
    '                for r in deduped\n'
    '            ])\n'
    '            stats["inserted"] += len(deduped)\n'
    '        insert_batch.clear()'
)

if OLD in content:
    content = content.replace(OLD, NEW)
    with open('/data/linkedin-import.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print('PATCHED OK')
else:
    print('OLD STRING NOT FOUND - showing lines 225-250 for debug:')
    lines = content.splitlines()
    for i, line in enumerate(lines[224:252], start=225):
        print(f"{i}: {repr(line)}")

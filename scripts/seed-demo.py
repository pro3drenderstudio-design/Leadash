"""
Seed demo data into the leads VPS for testing the Discover UI.
Inserts 12 companies and ~80 people across departments, seniorities, countries.
Run: python scripts/seed-demo.py
"""
import paramiko, json, textwrap

HOST = "89.117.51.235"
USER = "root"
PASS = "M6161505c"

SQL = r"""
-- ── Companies ──────────────────────────────────────────────────────────────────
INSERT INTO discover_companies (id, name, domain, website_url, industry, size_range, country, city, source)
VALUES
  ('11111111-0000-0000-0000-000000000001', 'Stripe',           'stripe.com',      'https://stripe.com',      'Financial Services',       '1001-5000',  'United States', 'San Francisco', 'demo'),
  ('11111111-0000-0000-0000-000000000002', 'Linear',           'linear.app',      'https://linear.app',      'Software',                 '11-50',      'United States', 'San Francisco', 'demo'),
  ('11111111-0000-0000-0000-000000000003', 'Vercel',           'vercel.com',      'https://vercel.com',      'SaaS',                     '201-500',    'United States', 'San Francisco', 'demo'),
  ('11111111-0000-0000-0000-000000000004', 'Intercom',         'intercom.com',    'https://intercom.com',    'SaaS',                     '501-1000',   'United States', 'Chicago',       'demo'),
  ('11111111-0000-0000-0000-000000000005', 'HubSpot',          'hubspot.com',     'https://hubspot.com',     'Marketing & Advertising',  '5001-10000', 'United States', 'Cambridge',     'demo'),
  ('11111111-0000-0000-0000-000000000006', 'Figma',            'figma.com',       'https://figma.com',       'Software',                 '201-500',    'United States', 'San Francisco', 'demo'),
  ('11111111-0000-0000-0000-000000000007', 'Notion',           'notion.so',       'https://notion.so',       'SaaS',                     '201-500',    'United States', 'San Francisco', 'demo'),
  ('11111111-0000-0000-0000-000000000008', 'Salesforce',       'salesforce.com',  'https://salesforce.com',  'SaaS',                     '10001+',     'United States', 'San Francisco', 'demo'),
  ('11111111-0000-0000-0000-000000000009', 'Atlassian',        'atlassian.com',   'https://atlassian.com',   'Software',                 '5001-10000', 'Australia',     'Sydney',        'demo'),
  ('11111111-0000-0000-0000-00000000000a', 'Shopify',          'shopify.com',     'https://shopify.com',     'E-commerce',               '5001-10000', 'Canada',        'Ottawa',        'demo'),
  ('11111111-0000-0000-0000-00000000000b', 'Revolut',          'revolut.com',     'https://revolut.com',     'Financial Services',       '1001-5000',  'United Kingdom','London',        'demo'),
  ('11111111-0000-0000-0000-00000000000c', 'Loom',             'loom.com',        'https://loom.com',        'SaaS',                     '51-200',     'United States', 'San Francisco', 'demo')
ON CONFLICT DO NOTHING;

-- ── People ─────────────────────────────────────────────────────────────────────
INSERT INTO discover_people (
  id, company_id, company_name, first_name, last_name,
  title, seniority, department,
  linkedin_url, email, email_status, phone,
  country, state, city, source
) VALUES
-- Stripe
  ('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','Stripe','Patrick','Collison','CEO','c_suite','engineering','https://linkedin.com/in/patrickcollison','patrick@stripe.com','verified','+1 415 555 0100','United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','Stripe','Claire','Hughes Johnson','COO','c_suite','operations','https://linkedin.com/in/clairehj','claire@stripe.com','verified','+1 415 555 0101','United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000001','Stripe','Jeanne','DeWitt Grosser','Head of Americas Revenue','head','sales','https://linkedin.com/in/jeannedewitt','jeanne.dewitt@stripe.com','extrapolated','+1 415 555 0102','United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-000000000004','11111111-0000-0000-0000-000000000001','Stripe','Michelle','Zatlyn','VP Engineering','vp','engineering','https://linkedin.com/in/michellezatlyn','michelle@stripe.com','verified','+1 415 555 0103','United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000001','Stripe','James','Dyett','Head of Sales','head','sales','https://linkedin.com/in/jamesdyett','james.dyett@stripe.com','extrapolated',NULL,'United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-000000000006','11111111-0000-0000-0000-000000000001','Stripe','Sarah','Kim','Director of Marketing','director','marketing','https://linkedin.com/in/sarahkim-stripe','s.kim@stripe.com','verified','+1 415 555 0105','United States','CA','San Francisco','demo'),
-- Linear
  ('22222222-0000-0000-0000-000000000007','11111111-0000-0000-0000-000000000002','Linear','Karri','Saarinen','CEO & Co-Founder','founder','engineering','https://linkedin.com/in/karrisaarinen','karri@linear.app','verified',NULL,'United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-000000000008','11111111-0000-0000-0000-000000000002','Linear','Tuomas','Artman','CTO & Co-Founder','founder','engineering','https://linkedin.com/in/tuomasartman','tuomas@linear.app','verified',NULL,'United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-000000000009','11111111-0000-0000-0000-000000000002','Linear','Tom','Moor','Head of Design','head','design','https://linkedin.com/in/tommoor','tom@linear.app','extrapolated',NULL,'United States','CA','San Francisco','demo'),
-- Vercel
  ('22222222-0000-0000-0000-00000000000a','11111111-0000-0000-0000-000000000003','Vercel','Guillermo','Rauch','CEO','c_suite','engineering','https://linkedin.com/in/guilrauch','g@vercel.com','verified','+1 650 555 0200','United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-00000000000b','11111111-0000-0000-0000-000000000003','Vercel','Lee','Robinson','VP Developer Experience','vp','engineering','https://linkedin.com/in/leeerob','lee@vercel.com','verified',NULL,'United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-00000000000c','11111111-0000-0000-0000-000000000003','Vercel','Lydia','Hallie','Senior Developer Advocate','senior','engineering','https://linkedin.com/in/lydiahallie','l.hallie@vercel.com','extrapolated',NULL,'Netherlands',NULL,'Amsterdam','demo'),
  ('22222222-0000-0000-0000-00000000000d','11111111-0000-0000-0000-000000000003','Vercel','Malte','Ubl','Director of Product','director','product','https://linkedin.com/in/malteubl','malte@vercel.com','verified',NULL,'United States','CA','San Francisco','demo'),
-- Intercom
  ('22222222-0000-0000-0000-00000000000e','11111111-0000-0000-0000-000000000004','Intercom','Eoghan','McCabe','CEO','c_suite','operations','https://linkedin.com/in/eoghanmccabe','eoghan@intercom.com','verified','+1 312 555 0300','United States','IL','Chicago','demo'),
  ('22222222-0000-0000-0000-00000000000f','11111111-0000-0000-0000-000000000004','Intercom','Des','Traynor','Co-Founder & CSO','founder','product','https://linkedin.com/in/destraynor','des@intercom.com','verified',NULL,'Ireland',NULL,'Dublin','demo'),
  ('22222222-0000-0000-0000-000000000010','11111111-0000-0000-0000-000000000004','Intercom','Karen','Peacock','COO','c_suite','operations','https://linkedin.com/in/karenpeacock','karen@intercom.com','verified','+1 312 555 0302','United States','IL','Chicago','demo'),
  ('22222222-0000-0000-0000-000000000011','11111111-0000-0000-0000-000000000004','Intercom','David','Barrett','VP Sales','vp','sales','https://linkedin.com/in/davidbarrett-intercom','d.barrett@intercom.com','extrapolated','+1 312 555 0303','United States','IL','Chicago','demo'),
  ('22222222-0000-0000-0000-000000000012','11111111-0000-0000-0000-000000000004','Intercom','Anna','Griffin','CMO','c_suite','marketing','https://linkedin.com/in/annagriffin','a.griffin@intercom.com','verified','+1 312 555 0304','United States','IL','Chicago','demo'),
-- HubSpot
  ('22222222-0000-0000-0000-000000000013','11111111-0000-0000-0000-000000000005','HubSpot','Yamini','Rangan','CEO','c_suite','operations','https://linkedin.com/in/yaminirangan','y.rangan@hubspot.com','verified','+1 617 555 0400','United States','MA','Cambridge','demo'),
  ('22222222-0000-0000-0000-000000000014','11111111-0000-0000-0000-000000000005','HubSpot','Kipp','Bodnar','CMO','c_suite','marketing','https://linkedin.com/in/kippbodnar','k.bodnar@hubspot.com','verified','+1 617 555 0401','United States','MA','Cambridge','demo'),
  ('22222222-0000-0000-0000-000000000015','11111111-0000-0000-0000-000000000005','HubSpot','Nancy','Hamerman','VP Product','vp','product','https://linkedin.com/in/nancyhamer','n.hamer@hubspot.com','extrapolated',NULL,'United States','MA','Cambridge','demo'),
  ('22222222-0000-0000-0000-000000000016','11111111-0000-0000-0000-000000000005','HubSpot','Mark','Roberge','Former CRO (Advisor)','senior','sales','https://linkedin.com/in/markroberge','m.roberge@hubspot.com','unverified','+1 617 555 0403','United States','MA','Cambridge','demo'),
  ('22222222-0000-0000-0000-000000000017','11111111-0000-0000-0000-000000000005','HubSpot','Andrew','Quinn','VP Learning & Development','vp','hr','https://linkedin.com/in/andrewquinn-hs','a.quinn@hubspot.com','extrapolated',NULL,'United States','MA','Cambridge','demo'),
-- Figma
  ('22222222-0000-0000-0000-000000000018','11111111-0000-0000-0000-000000000006','Figma','Dylan','Field','CEO & Co-Founder','founder','design','https://linkedin.com/in/dylanfield','dylan@figma.com','verified','+1 415 555 0500','United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-000000000019','11111111-0000-0000-0000-000000000006','Figma','Evan','Wallace','CTO & Co-Founder','founder','engineering','https://linkedin.com/in/evanwallace','evan@figma.com','verified',NULL,'United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-00000000001a','11111111-0000-0000-0000-000000000006','Figma','Amanda','Kleha','Chief Customer Officer','c_suite','customer_success','https://linkedin.com/in/amandakleha','a.kleha@figma.com','verified','+1 415 555 0502','United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-00000000001b','11111111-0000-0000-0000-000000000006','Figma','Noah','Levin','VP Product','vp','product','https://linkedin.com/in/noahlevin','n.levin@figma.com','extrapolated',NULL,'United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-00000000001c','11111111-0000-0000-0000-000000000006','Figma','Sho','Kuwamoto','VP Design','vp','design','https://linkedin.com/in/shokuwamoto','s.kuwamoto@figma.com','verified',NULL,'United States','CA','San Francisco','demo'),
-- Notion
  ('22222222-0000-0000-0000-00000000001d','11111111-0000-0000-0000-000000000007','Notion','Ivan','Zhao','CEO & Co-Founder','founder','engineering','https://linkedin.com/in/ivanz','ivan@notion.so','verified','+1 415 555 0600','United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-00000000001e','11111111-0000-0000-0000-000000000007','Notion','Akosua','Asante','VP Marketing','vp','marketing','https://linkedin.com/in/akosua-asante','a.asante@notion.so','extrapolated',NULL,'United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-00000000001f','11111111-0000-0000-0000-000000000007','Notion','Camille','Ricketts','Head of Content & Community','head','marketing','https://linkedin.com/in/camillericketts','c.ricketts@notion.so','verified',NULL,'United States','CA','San Francisco','demo'),
-- Salesforce
  ('22222222-0000-0000-0000-000000000020','11111111-0000-0000-0000-000000000008','Salesforce','Marc','Benioff','CEO & Founder','founder','operations','https://linkedin.com/in/marcbenioff','marc@salesforce.com','verified','+1 415 555 0700','United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-000000000021','11111111-0000-0000-0000-000000000008','Salesforce','Bret','Taylor','President & COO','c_suite','operations','https://linkedin.com/in/brettaylor','bret@salesforce.com','verified','+1 415 555 0701','United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-000000000022','11111111-0000-0000-0000-000000000008','Salesforce','Sarah','Franklin','CMO','c_suite','marketing','https://linkedin.com/in/sarahfranklin-sf','s.franklin@salesforce.com','verified','+1 415 555 0702','United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-000000000023','11111111-0000-0000-0000-000000000008','Salesforce','Tyler','Prince','EVP Sales','vp','sales','https://linkedin.com/in/tylerprince','t.prince@salesforce.com','extrapolated','+1 415 555 0703','United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-000000000024','11111111-0000-0000-0000-000000000008','Salesforce','Cindy','Robbins','Former CPO (Advisor)','senior','hr','https://linkedin.com/in/cindyrobbins','c.robbins@salesforce.com','unverified',NULL,'United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-000000000025','11111111-0000-0000-0000-000000000008','Salesforce','Ebony','Beckwith','Chief Impact Officer','c_suite','operations','https://linkedin.com/in/ebonybeckwith','e.beckwith@salesforce.com','verified','+1 415 555 0705','United States','CA','San Francisco','demo'),
-- Atlassian
  ('22222222-0000-0000-0000-000000000026','11111111-0000-0000-0000-000000000009','Atlassian','Mike','Cannon-Brookes','CEO & Co-Founder','founder','engineering','https://linkedin.com/in/mcannonbrookes','mike@atlassian.com','verified','+61 2 5555 0800','Australia','NSW','Sydney','demo'),
  ('22222222-0000-0000-0000-000000000027','11111111-0000-0000-0000-000000000009','Atlassian','Scott','Farquhar','Co-CEO & Co-Founder','founder','operations','https://linkedin.com/in/scottfarquhar','scott@atlassian.com','verified','+61 2 5555 0801','Australia','NSW','Sydney','demo'),
  ('22222222-0000-0000-0000-000000000028','11111111-0000-0000-0000-000000000009','Atlassian','Anu','Bharadwaj','President','c_suite','operations','https://linkedin.com/in/anubharadwaj','anu@atlassian.com','verified','+61 2 5555 0802','Australia','NSW','Sydney','demo'),
  ('22222222-0000-0000-0000-000000000029','11111111-0000-0000-0000-000000000009','Atlassian','Rao','Surapaneni','VP Engineering','vp','engineering','https://linkedin.com/in/raosurapaneni','r.surapaneni@atlassian.com','extrapolated',NULL,'Australia','NSW','Sydney','demo'),
  ('22222222-0000-0000-0000-00000000002a','11111111-0000-0000-0000-000000000009','Atlassian','Tricia','Tang','Director of Sales APAC','director','sales','https://linkedin.com/in/triciatang','t.tang@atlassian.com','verified','+61 2 5555 0804','Australia','NSW','Sydney','demo'),
-- Shopify
  ('22222222-0000-0000-0000-00000000002b','11111111-0000-0000-0000-00000000000a','Shopify','Tobi','Lütke','CEO & Founder','founder','engineering','https://linkedin.com/in/tobiaslutke','tobi@shopify.com','verified','+1 613 555 0900','Canada','ON','Ottawa','demo'),
  ('22222222-0000-0000-0000-00000000002c','11111111-0000-0000-0000-00000000000a','Shopify','Harley','Finkelstein','President','c_suite','operations','https://linkedin.com/in/harleyf','harley@shopify.com','verified','+1 613 555 0901','Canada','ON','Ottawa','demo'),
  ('22222222-0000-0000-0000-00000000002d','11111111-0000-0000-0000-00000000000a','Shopify','Amy','Shapero','CFO','c_suite','finance','https://linkedin.com/in/amyshapero','a.shapero@shopify.com','verified','+1 613 555 0902','Canada','ON','Ottawa','demo'),
  ('22222222-0000-0000-0000-00000000002e','11111111-0000-0000-0000-00000000000a','Shopify','Craig','Miller','CPO','c_suite','product','https://linkedin.com/in/craigmiller-shopify','c.miller@shopify.com','extrapolated',NULL,'Canada','ON','Ottawa','demo'),
  ('22222222-0000-0000-0000-00000000002f','11111111-0000-0000-0000-00000000000a','Shopify','Shimona','Mehta','Director of Customer Success','director','customer_success','https://linkedin.com/in/shimonamehta','s.mehta@shopify.com','verified','+1 613 555 0904','Canada','ON','Ottawa','demo'),
  ('22222222-0000-0000-0000-000000000030','11111111-0000-0000-0000-00000000000a','Shopify','Brandon','Chu','VP Product','vp','product','https://linkedin.com/in/brandonchu','b.chu@shopify.com','extrapolated',NULL,'Canada','ON','Ottawa','demo'),
-- Revolut
  ('22222222-0000-0000-0000-000000000031','11111111-0000-0000-0000-00000000000b','Revolut','Nik','Storonsky','CEO & Co-Founder','founder','finance','https://linkedin.com/in/nikolaystoronsky','nik@revolut.com','verified','+44 20 5555 1000','United Kingdom','England','London','demo'),
  ('22222222-0000-0000-0000-000000000032','11111111-0000-0000-0000-00000000000b','Revolut','Vlad','Yatsenko','CTO & Co-Founder','founder','engineering','https://linkedin.com/in/vladyatsenko','vlad@revolut.com','verified','+44 20 5555 1001','United Kingdom','England','London','demo'),
  ('22222222-0000-0000-0000-000000000033','11111111-0000-0000-0000-00000000000b','Revolut','Martin','Gilbert','Chairman','c_suite','operations','https://linkedin.com/in/martingilbert','m.gilbert@revolut.com','extrapolated','+44 20 5555 1002','United Kingdom','England','London','demo'),
  ('22222222-0000-0000-0000-000000000034','11111111-0000-0000-0000-00000000000b','Revolut','Elena','Ionesco','VP Marketing EMEA','vp','marketing','https://linkedin.com/in/elenaionesco','e.ionesco@revolut.com','extrapolated',NULL,'United Kingdom','England','London','demo'),
  ('22222222-0000-0000-0000-000000000035','11111111-0000-0000-0000-00000000000b','Revolut','Antoine','Le Nel','Head of Growth','head','marketing','https://linkedin.com/in/antoinelenel','a.lenel@revolut.com','verified',NULL,'United Kingdom','England','London','demo'),
  ('22222222-0000-0000-0000-000000000036','11111111-0000-0000-0000-00000000000b','Revolut','Tom','Foster','Director of Sales UK','director','sales','https://linkedin.com/in/tomfoster-revolut','t.foster@revolut.com','verified','+44 20 5555 1005','United Kingdom','England','London','demo'),
-- Loom
  ('22222222-0000-0000-0000-000000000037','11111111-0000-0000-0000-00000000000c','Loom','Joe','Thomas','CEO & Co-Founder','founder','operations','https://linkedin.com/in/josephjamesthomas','joe@loom.com','verified','+1 415 555 1100','United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-000000000038','11111111-0000-0000-0000-00000000000c','Loom','Shahed','Khan','Co-Founder & VP Growth','founder','marketing','https://linkedin.com/in/shahedkhan','shahed@loom.com','verified',NULL,'United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-000000000039','11111111-0000-0000-0000-00000000000c','Loom','Vinay','Hiremath','CTO & Co-Founder','founder','engineering','https://linkedin.com/in/vinayhiremath','vinay@loom.com','verified',NULL,'United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-00000000003a','11111111-0000-0000-0000-00000000000c','Loom','Aja','Hammerly','VP Marketing','vp','marketing','https://linkedin.com/in/ajahammerly','a.hammerly@loom.com','extrapolated','+1 415 555 1103','United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-00000000003b','11111111-0000-0000-0000-00000000000c','Loom','Sam','Donoghue','Head of Sales','head','sales','https://linkedin.com/in/samdonoghue','s.donoghue@loom.com','verified','+1 415 555 1104','United States','CA','San Francisco','demo'),
  ('22222222-0000-0000-0000-00000000003c','11111111-0000-0000-0000-00000000000c','Loom','Priya','Tulsiani','Director of Customer Success','director','customer_success','https://linkedin.com/in/priyatulsiani','p.tulsiani@loom.com','verified',NULL,'United States','CA','San Francisco','demo')
ON CONFLICT DO NOTHING;
"""

def run():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASS, timeout=15)

    # Write SQL to a temp file on VPS, then run it
    sftp = client.open_sftp()
    with sftp.open("/tmp/seed-demo.sql", "w") as f:
        f.write(SQL)
    sftp.close()

    cmd = "PGPASSWORD='Ld!Disc0ver2026' psql -h 127.0.0.1 -U leadash_user -d leadash_leads -f /tmp/seed-demo.sql && echo 'DONE'"
    _, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()

    if out.strip():
        print(out)
    if err.strip():
        print("STDERR:", err)

    client.close()
    print("Seed complete.")

run()

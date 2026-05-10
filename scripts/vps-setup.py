"""
VPS setup script for leads database server.
Run: python scripts/vps-setup.py
"""
import paramiko
import sys
import time

HOST = "89.117.51.235"
USER = "root"
PASS = "M6161505c"

def run(client, cmd, timeout=120):
    chan = client.get_transport().open_session()
    chan.exec_command(cmd)
    chan.shutdown_write()
    deadline = time.time() + timeout
    out = b""
    err = b""
    while time.time() < deadline:
        if chan.recv_ready():
            out += chan.recv(65536)
        if chan.recv_stderr_ready():
            err += chan.recv_stderr(65536)
        if chan.exit_status_ready():
            while chan.recv_ready():
                out += chan.recv(65536)
            while chan.recv_stderr_ready():
                err += chan.recv_stderr(65536)
            break
        time.sleep(0.5)
    code = chan.recv_exit_status()
    return out.decode("utf-8", errors="replace"), err.decode("utf-8", errors="replace"), code

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=15)
print(f"Connected to {HOST}")

step = int(sys.argv[1]) if len(sys.argv) > 1 else 0

# ── Step 0: Install PostgreSQL 16 ─────────────────────────────────────────────
if step == 0:
    print("\n[1/5] Installing PostgreSQL 16...")
    o, e, c = run(client, "DEBIAN_FRONTEND=noninteractive apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql-16 postgresql-client-16 2>&1 | tail -5", timeout=300)
    print(o[-1000:] if o else "(no output)")
    if c != 0:
        print("ERROR:", e[:500]); sys.exit(1)

    o, e, c = run(client, "pg_lsclusters")
    print(o)

# ── Step 1: Configure PostgreSQL for 48GB RAM ─────────────────────────────────
if step <= 1:
    print("\n[2/5] Tuning PostgreSQL for 48GB RAM...")
    conf = """
cat >> /etc/postgresql/16/main/postgresql.conf << 'EOF'

# Leadash tuning for 48GB RAM, SSD storage
shared_buffers = 12GB
effective_cache_size = 36GB
maintenance_work_mem = 2GB
work_mem = 256MB
max_worker_processes = 12
max_parallel_workers_per_gather = 6
max_parallel_workers = 12
wal_buffers = 64MB
checkpoint_completion_target = 0.9
random_page_cost = 1.1
effective_io_concurrency = 200
max_connections = 100
EOF
"""
    o, e, c = run(client, conf)
    print("Conf written." if c == 0 else f"ERROR: {e[:300]}")

# ── Step 2: Allow remote connections ──────────────────────────────────────────
if step <= 2:
    print("\n[3/5] Configuring remote access...")
    o, e, c = run(client, "sed -i \"s/#listen_addresses = 'localhost'/listen_addresses = '*'/\" /etc/postgresql/16/main/postgresql.conf")
    print("listen_addresses set." if c == 0 else f"ERROR: {e}")

    hba = "echo \"host leadash_leads leadash_user all scram-sha-256\" >> /etc/postgresql/16/main/pg_hba.conf"
    o, e, c = run(client, hba)
    print("pg_hba updated." if c == 0 else f"ERROR: {e}")

# ── Step 3: Create DB, user, tables ───────────────────────────────────────────
if step <= 3:
    print("\n[4/5] Creating database, user, and tables...")
    sql = """
sudo -u postgres psql << 'SQLEOF'
CREATE USER leadash_user WITH PASSWORD 'Ld!Disc0ver2026' CONNECTION LIMIT 50;
CREATE DATABASE leadash_leads OWNER leadash_user ENCODING 'UTF8';
GRANT ALL PRIVILEGES ON DATABASE leadash_leads TO leadash_user;
\\c leadash_leads

CREATE TABLE discover_companies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT,
    domain          TEXT,
    website_url     TEXT,
    linkedin_url    TEXT,
    industry        TEXT,
    size_range      TEXT,
    employee_count  INT,
    country         TEXT,
    state           TEXT,
    city            TEXT,
    revenue_usd     BIGINT,
    funding_total   BIGINT,
    funding_stage   TEXT,
    description     TEXT,
    source          TEXT,
    source_id       TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE discover_people (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID REFERENCES discover_companies(id),
    company_name    TEXT,
    first_name      TEXT,
    last_name       TEXT,
    title           TEXT,
    seniority       TEXT,
    department      TEXT,
    linkedin_url    TEXT,
    email           TEXT,
    email_status    TEXT,
    phone           TEXT,
    country         TEXT,
    state           TEXT,
    city            TEXT,
    source          TEXT,
    source_id       TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX discover_people_email_idx    ON discover_people (email) WHERE email IS NOT NULL AND email <> '';
CREATE UNIQUE INDEX discover_people_linkedin_idx ON discover_people (lower(linkedin_url)) WHERE linkedin_url IS NOT NULL;
CREATE UNIQUE INDEX discover_companies_domain_idx ON discover_companies (lower(domain)) WHERE domain IS NOT NULL;
CREATE INDEX discover_people_company_idx  ON discover_people (company_id);
CREATE INDEX discover_people_seniority_idx ON discover_people (seniority);
CREATE INDEX discover_people_country_idx  ON discover_people (country);
CREATE INDEX discover_people_source_idx   ON discover_people (source);

GRANT ALL ON TABLE discover_people    TO leadash_user;
GRANT ALL ON TABLE discover_companies TO leadash_user;
SQLEOF
"""
    o, e, c = run(client, sql, timeout=60)
    print(o)
    if e.strip():
        print("STDERR:", e[:500])

# ── Step 4: Firewall ───────────────────────────────────────────────────────────
if step <= 4:
    print("\n[5/5] Setting up firewall...")
    cmds = [
        "ufw allow 22/tcp",
        "ufw allow from 209.145.55.138 to any port 5432",  # main VPS
        "ufw --force enable",
        "systemctl restart postgresql",
        "systemctl enable postgresql",
        "pg_lsclusters",
    ]
    for cmd in cmds:
        o, e, c = run(client, cmd, timeout=30)
        status = "OK" if c == 0 else f"FAILED(exit {c})"
        print(f"  {cmd[:60]}: {status}")
        if o.strip(): print("   ", o.strip()[:200])

print("\nDone! PostgreSQL 16 running on 89.117.51.235:5432")
print("DB: leadash_leads | User: leadash_user | Pass: Ld!Disc0ver2026")
client.close()

"""
Upload AgTech + Fresh Apollo CSV exports to VPS and start the import.

Usage:
  python scripts/send-apollo-exports.py          # uploads + starts both
  python scripts/send-apollo-exports.py agtech   # agtech only
  python scripts/send-apollo-exports.py fresh    # fresh apollo only
  python scripts/send-apollo-exports.py status   # check import log
"""
import paramiko, sys, os, time, zipfile, io

HOST = "89.117.51.235"
USER = "root"
PASS = "M6161505c"

AGTECH_DIR = (
    r"C:\Users\Abdul Malik\Downloads"
    r"\Entire Apollo Database 99,311,285-001"
    r"\Entire Apollo Database 99,311,285"
    r"\Agtech Apollo Database"
)
FRESH_ZIP = (
    r"C:\Users\Abdul Malik\Downloads"
    r"\APOLLO-20260509T120125Z-3-002\APOLLO"
    r"\Fresh Apollo Leads 1,232,352.zip"
)
IMPORT_SCRIPT = os.path.join(os.path.dirname(__file__), "import-apollo-export.py")

VPS_DIR    = "/data/apollo-exports"
VPS_SCRIPT = "/data/import-apollo-export.py"
VPS_LOG    = "/data/import-apollo-export.log"


def connect():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASS, timeout=30)
    client.get_transport().set_keepalive(30)
    return client


def run(client, cmd, timeout=30):
    _, o, e = client.exec_command(cmd, timeout=timeout)
    return (o.read() + e.read()).decode(errors="replace").strip()


def upload_file(sftp, local_path, remote_path, label=None):
    size_mb = os.path.getsize(local_path) / 1e6
    name = label or os.path.basename(local_path)
    print(f"  uploading {name} ({size_mb:.1f} MB)...", end=" ", flush=True)
    t = time.time()
    sftp.put(local_path, remote_path)
    print(f"done in {time.time()-t:.0f}s")


def upload_bytes(sftp, data: bytes, remote_path: str, label: str):
    print(f"  uploading {label} ({len(data)/1e6:.1f} MB)...", end=" ", flush=True)
    t = time.time()
    with sftp.open(remote_path, "wb") as f:
        f.write(data)
    print(f"done in {time.time()-t:.0f}s")


def do_status():
    client = connect()
    print("=== import process ===")
    print(run(client, "pgrep -a -f import-apollo-export || echo 'NOT running'"))
    print("\n=== log tail ===")
    print(run(client, f"tail -20 {VPS_LOG} 2>/dev/null || echo 'no log yet'"))
    print("\n=== DB counts ===")
    print(run(client,
        "sudo -u postgres psql -d leadash_leads -c "
        "'SELECT (SELECT COUNT(*) FROM discover_people) people, "
        "(SELECT COUNT(*) FROM discover_companies) companies;'", 30))
    client.close()


def do_upload_agtech(sftp, client):
    print("\n--- AgTech Apollo ---")
    run(client, f"mkdir -p {VPS_DIR}/agtech")
    files = [f for f in os.listdir(AGTECH_DIR) if f.endswith(".csv")]
    print(f"  {len(files)} CSV files ({sum(os.path.getsize(os.path.join(AGTECH_DIR,f)) for f in files)/1e6:.0f} MB total)")
    for fname in sorted(files):
        local  = os.path.join(AGTECH_DIR, fname)
        remote = f"{VPS_DIR}/agtech/{fname}"
        upload_file(sftp, local, remote)


def do_upload_fresh(sftp, client):
    print("\n--- Fresh Apollo Leads ---")
    run(client, f"mkdir -p {VPS_DIR}/fresh")
    # Extract CSVs from zip and upload individually (skip non-CSV entries)
    with zipfile.ZipFile(FRESH_ZIP) as zf:
        csv_entries = [e for e in zf.infolist() if e.filename.endswith(".csv")]
        print(f"  {len(csv_entries)} CSVs in zip ({sum(e.file_size for e in csv_entries)/1e6:.0f} MB uncompressed)")
        for entry in csv_entries:
            # Flatten filename (strip subdirectory)
            fname  = os.path.basename(entry.filename)
            remote = f"{VPS_DIR}/fresh/{fname}"
            data   = zf.read(entry.filename)
            upload_bytes(sftp, data, remote, fname)


def do_import(client, glob_pattern, log_suffix=""):
    log = VPS_LOG if not log_suffix else VPS_LOG.replace(".log", f"-{log_suffix}.log")
    cmd = (
        f"nohup python3 {VPS_SCRIPT} '{glob_pattern}' "
        f"> {log} 2>&1 & echo PID:$!"
    )
    result = run(client, cmd, 10)
    print(f"\n  Import started: {result}")
    time.sleep(3)
    print(run(client, f"head -15 {log} 2>/dev/null || echo 'no log yet'"))


mode = sys.argv[1] if len(sys.argv) > 1 else "both"

if mode == "status":
    do_status()
    sys.exit(0)

client = connect()
sftp   = client.open_sftp()

# Upload import script
print("=== uploading import script ===")
upload_file(sftp, IMPORT_SCRIPT, VPS_SCRIPT)

if mode in ("agtech", "both"):
    do_upload_agtech(sftp, client)

if mode in ("fresh", "both"):
    do_upload_fresh(sftp, client)

sftp.close()

# Start imports (sequentially — agtech first, then fresh)
print("\n=== starting imports ===")
if mode in ("agtech", "both"):
    print("\nStarting AgTech import...")
    do_import(client, f"{VPS_DIR}/agtech/*.csv", "agtech")

if mode in ("fresh", "both"):
    if mode == "both":
        # Wait for agtech to finish before starting fresh, or run in background
        # Both run in background via nohup so they'll run in parallel
        pass
    print("\nStarting Fresh Apollo import...")
    do_import(client, f"{VPS_DIR}/fresh/*.csv", "fresh")

print("\n=== done ===")
print(f"Monitor with:  python scripts/send-apollo-exports.py status")
print(f"Or SSH:        ssh root@{HOST} 'tail -f {VPS_LOG}'")

client.close()

#!/usr/bin/env python3
"""
Transfer PDL zip to VPS and extract CSV chunks there.
Run locally on Windows. Takes ~30-45 min for the 28.9GB zip.
After this completes, SSH into VPS and run:
  nohup python3 /data/pdl/import-pdl.py > /data/pdl/import-pdl.log 2>&1 &
"""

import paramiko, os, zipfile, time, sys
from stat import S_ISDIR

ZIP_PATH   = r"C:\Users\Abdul Malik\Downloads\People Datalabs Database 415,821,844-001.zip"
VPS_HOST   = "89.117.51.235"
VPS_USER   = "root"
VPS_PASS   = "M6161505c"
REMOTE_DIR = "/data/pdl"
CHUNKS_DIR = "/data/pdl/chunks"

def connect():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(VPS_HOST, username=VPS_USER, password=VPS_PASS, timeout=30)
    return client

def run(client, cmd, timeout=30):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    return out, err

def main():
    print("=== PDL Transfer & Extract ===")

    # --- Step 1: prep VPS directories ---
    print("\n[1/3] Preparing VPS directories...")
    client = connect()
    run(client, f"mkdir -p {CHUNKS_DIR}")
    out, _ = run(client, f"ls {CHUNKS_DIR} | wc -l")
    existing_chunks = int(out or 0)
    print(f"  {existing_chunks} chunks already on VPS")
    client.close()

    # --- Step 2: transfer & extract chunks not yet on VPS ---
    print(f"\n[2/3] Opening ZIP: {ZIP_PATH}")
    with zipfile.ZipFile(ZIP_PATH, "r") as z:
        chunk_entries = sorted([
            e for e in z.infolist()
            if "PeopleDataLabs_chunk_" in e.filename and e.filename.endswith(".csv")
        ], key=lambda e: e.filename)

        total = len(chunk_entries)
        print(f"  {total} chunks in ZIP ({existing_chunks} already transferred)")

        client = connect()
        sftp = client.open_sftp()

        for i, entry in enumerate(chunk_entries, 1):
            fname = os.path.basename(entry.filename)
            remote_path = f"{CHUNKS_DIR}/{fname}"

            # Check if already transferred
            try:
                sftp.stat(remote_path)
                print(f"  [{i}/{total}] {fname} — already on VPS, skipping")
                continue
            except FileNotFoundError:
                pass

            t_start = time.time()
            print(f"  [{i}/{total}] {fname} ({entry.file_size / 1e6:.0f} MB) — transferring...", end="", flush=True)

            with z.open(entry) as src:
                data = src.read()

            with sftp.open(remote_path, "wb") as dst:
                dst.write(data)

            elapsed = time.time() - t_start
            mb = len(data) / 1e6
            print(f" done ({mb:.0f} MB in {elapsed:.1f}s, {mb/elapsed:.1f} MB/s)")

            # Reconnect every 20 chunks to avoid SSH timeout
            if i % 20 == 0:
                sftp.close()
                client.close()
                time.sleep(2)
                client = connect()
                sftp = client.open_sftp()

        sftp.close()
        client.close()

    # --- Step 3: upload import script to VPS ---
    print("\n[3/3] Uploading import-pdl.py to VPS...")
    script_local = os.path.join(os.path.dirname(__file__), "import-pdl.py")
    if not os.path.exists(script_local):
        print(f"  ERROR: {script_local} not found — copy it manually")
    else:
        client = connect()
        sftp = client.open_sftp()
        sftp.put(script_local, "/data/pdl/import-pdl.py")
        run(client, "pip3 install psycopg2-binary -q")
        sftp.close()
        client.close()
        print("  Uploaded. Install deps: pip3 install psycopg2-binary")

    print("\n=== Transfer complete ===")
    print("To start import on VPS:")
    print("  ssh root@89.117.51.235")
    print("  nohup python3 /data/pdl/import-pdl.py > /data/pdl/import-pdl.log 2>&1 &")
    print("  tail -f /data/pdl/import-pdl.log")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
SCP the PDL zip to VPS and unzip there.
Run locally. Takes ~1-3 hours depending on connection speed.
"""
import paramiko, os, time, sys

ZIP_PATH  = r"C:\Users\Abdul Malik\Downloads\People Datalabs Database 415,821,844-001.zip"
VPS_HOST  = "89.117.51.235"
VPS_USER  = "root"
VPS_PASS  = "M6161505c"
REMOTE_ZIP = "/data/pdl/pdl.zip"
CHUNKS_DIR = "/data/pdl/chunks"

def connect():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(VPS_HOST, username=VPS_USER, password=VPS_PASS, timeout=60)
    # Keep connection alive every 30s to prevent timeout drops during long transfer
    c.get_transport().set_keepalive(30)
    return c

def run(client, cmd, timeout=60):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    return stdout.read().decode().strip(), stderr.read().decode().strip()

def main():
    zip_size = os.path.getsize(ZIP_PATH)
    print(f"ZIP size: {zip_size / 1e9:.2f} GB")

    # Check if zip already on VPS
    client = connect()
    out, _ = run(client, f"stat -c %s {REMOTE_ZIP} 2>/dev/null || echo 0")
    remote_size = int(out or 0)
    client.close()

    if remote_size == zip_size:
        print(f"ZIP already fully transferred ({remote_size / 1e9:.2f} GB). Skipping upload.")
    else:
        resume_offset = remote_size if 0 < remote_size < zip_size else 0
        if resume_offset:
            print(f"Resuming from {resume_offset / 1e9:.2f} GB ({resume_offset * 100 // zip_size}%)...")
        else:
            print(f"Starting fresh transfer of {zip_size / 1e9:.2f} GB...")

        t0 = time.time()
        last_print = [0]
        CHUNK = 4 * 1024 * 1024  # 4 MB chunks

        client = connect()
        sftp = client.open_sftp()

        # Open remote in append mode if resuming, write mode if fresh
        mode = 'ab' if resume_offset else 'wb'
        remote_f = sftp.open(REMOTE_ZIP, mode)
        remote_f.set_pipelined(True)

        with open(ZIP_PATH, 'rb') as local_f:
            if resume_offset:
                local_f.seek(resume_offset)
            sent = resume_offset
            while True:
                data = local_f.read(CHUNK)
                if not data:
                    break
                remote_f.write(data)
                sent += len(data)
                now = time.time()
                if now - last_print[0] >= 15:
                    elapsed = now - t0
                    actual_sent = sent - resume_offset
                    rate_mb = actual_sent / elapsed / 1e6 if elapsed else 0
                    pct = sent / zip_size * 100
                    eta_min = (zip_size - sent) / (actual_sent / elapsed) / 60 if actual_sent else 0
                    print(f"  {pct:.1f}%  {sent/1e9:.2f}/{zip_size/1e9:.2f} GB  {rate_mb:.1f} MB/s  ETA ~{eta_min:.0f}min")
                    sys.stdout.flush()
                    last_print[0] = now

        remote_f.close()
        sftp.close()
        client.close()
        print(f"\nUpload done in {(time.time()-t0)/60:.1f} min")

    # Unzip on VPS
    print("\nUnzipping on VPS...")
    client = connect()
    run(client, f"mkdir -p {CHUNKS_DIR}")

    # Check how many chunks already extracted
    out, _ = run(client, f"ls {CHUNKS_DIR}/PeopleDataLabs_chunk_*.csv 2>/dev/null | wc -l")
    already = int(out or 0)
    print(f"  {already} chunks already extracted")

    if already < 418:
        print("  Running unzip (this takes ~10-20 min on VPS)...")
        # Use python3 on VPS to extract (handles the nested folder in zip)
        extract_script = f"""
import zipfile, os
zp = '{REMOTE_ZIP}'
out = '{CHUNKS_DIR}'
with zipfile.ZipFile(zp, 'r') as z:
    entries = [e for e in z.infolist() if 'PeopleDataLabs_chunk_' in e.filename and e.filename.endswith('.csv')]
    total = len(entries)
    for i, entry in enumerate(entries, 1):
        fname = os.path.basename(entry.filename)
        dest  = os.path.join(out, fname)
        if os.path.exists(dest) and os.path.getsize(dest) > 1000:
            print(f'  skip {{fname}}')
            continue
        print(f'  [{i}/{total}] {{fname}}...', flush=True)
        with z.open(entry) as src, open(dest, 'wb') as dst:
            while True:
                buf = src.read(8*1024*1024)
                if not buf: break
                dst.write(buf)
print('Extraction complete.')
"""
        # Write extraction script to VPS
        sftp = client.open_sftp()
        with sftp.open("/data/pdl/extract.py", "w") as f:
            f.write(extract_script)

        # Also upload import-pdl.py
        local_import = os.path.join(os.path.dirname(__file__), "import-pdl.py")
        if os.path.exists(local_import):
            sftp.put(local_import, "/data/pdl/import-pdl.py")
            print("  Uploaded import-pdl.py")
        sftp.close()

        # Run extraction in background
        stdin, stdout, stderr = client.exec_command(
            "nohup python3 /data/pdl/extract.py > /data/pdl/extract.log 2>&1 & echo $!"
        )
        pid = stdout.read().decode().strip()
        print(f"  Extraction running in background (PID {pid})")
        print("  Monitor: ssh root@89.117.51.235 && tail -f /data/pdl/extract.log")
    else:
        print("  All 418 chunks already extracted!")

        # Upload import script and start
        sftp = client.open_sftp()
        local_import = os.path.join(os.path.dirname(__file__), "import-pdl.py")
        if os.path.exists(local_import):
            sftp.put(local_import, "/data/pdl/import-pdl.py")
        sftp.close()

        stdin, stdout, stderr = client.exec_command(
            "nohup python3 /data/pdl/import-pdl.py > /data/pdl/import-pdl.log 2>&1 & echo $!"
        )
        pid = stdout.read().decode().strip()
        print(f"  PDL import started (PID {pid})")

    client.close()
    print("\nDone. After extraction completes, run on VPS:")
    print("  nohup python3 /data/pdl/import-pdl.py > /data/pdl/import-pdl.log 2>&1 &")
    print("  tail -f /data/pdl/import-pdl.log")

if __name__ == "__main__":
    main()

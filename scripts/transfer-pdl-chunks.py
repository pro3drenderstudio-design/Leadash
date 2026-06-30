#!/usr/bin/env python3
"""
Transfer PDL zip to VPS chunk-by-chunk.
Each chunk = one SSH connection (~60s) — avoids NAT TCP session timeouts.
Fully resumable: skips chunks already on VPS.
"""
import paramiko, zipfile, os, time, sys

ZIP_PATH   = r"C:\Users\Abdul Malik\Downloads\People Datalabs Database 415,821,844-001.zip"
VPS_HOST   = "89.117.51.235"
VPS_USER   = "root"
VPS_PASS   = "M6161505c"
CHUNKS_DIR = "/data/pdl/chunks"

def connect():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(VPS_HOST, username=VPS_USER, password=VPS_PASS, timeout=30)
    c.get_transport().set_keepalive(10)
    return c

def remote_size(sftp, path):
    try:
        return sftp.stat(path).st_size
    except FileNotFoundError:
        return 0

def main():
    print("Opening ZIP...")
    with zipfile.ZipFile(ZIP_PATH, "r") as z:
        chunks = sorted(
            [e for e in z.infolist() if "PeopleDataLabs_chunk_" in e.filename and e.filename.endswith(".csv")],
            key=lambda e: e.filename
        )
    total = len(chunks)
    print(f"{total} chunks found in ZIP")

    # Check which are already on VPS
    print("Checking VPS for existing chunks...")
    client = connect()
    sftp = client.open_sftp()
    client.exec_command(f"mkdir -p {CHUNKS_DIR}")
    done = set()
    for entry in chunks:
        fname = os.path.basename(entry.filename)
        rsize = remote_size(sftp, f"{CHUNKS_DIR}/{fname}")
        if rsize > 0 and rsize == entry.file_size:
            done.add(fname)
    sftp.close()
    client.close()
    print(f"{len(done)} / {total} chunks already transferred\n")

    remaining = [e for e in chunks if os.path.basename(e.filename) not in done]
    if not remaining:
        print("All chunks already on VPS!")
        _finalize()
        return

    t0 = time.time()
    transferred = len(done)

    with zipfile.ZipFile(ZIP_PATH, "r") as z:
        for i, entry in enumerate(remaining, 1):
            fname = os.path.basename(entry.filename)
            remote_path = f"{CHUNKS_DIR}/{fname}"
            size_mb = entry.file_size / 1e6

            t_chunk = time.time()
            print(f"[{transferred+1}/{total}] {fname} ({size_mb:.0f} MB)...", end="", flush=True)

            # Read (decompress) chunk into memory
            data = z.read(entry.filename)

            # New connection per chunk
            attempts = 0
            while True:
                try:
                    client = connect()
                    sftp = client.open_sftp()
                    with sftp.open(remote_path, "wb") as f:
                        f.set_pipelined(True)
                        f.write(data)
                    sftp.close()
                    client.close()
                    break
                except Exception as e:
                    attempts += 1
                    if attempts >= 3:
                        print(f" FAILED after 3 attempts: {e}")
                        sys.exit(1)
                    print(f" retry {attempts}...", end="", flush=True)
                    time.sleep(5)

            transferred += 1
            elapsed_chunk = time.time() - t_chunk
            rate = len(data) / elapsed_chunk / 1e6
            elapsed_total = time.time() - t0
            remaining_chunks = total - transferred
            eta_min = (elapsed_total / (transferred - len(done))) * remaining_chunks / 60 if transferred > len(done) else 0
            print(f" done ({elapsed_chunk:.0f}s, {rate:.1f} MB/s) | {transferred}/{total} | ETA ~{eta_min:.0f}min")

    _finalize()

def _finalize():
    print("\nAll chunks transferred. Starting extraction + import on VPS...")
    client = connect()

    # Upload import script
    script_local = os.path.join(os.path.dirname(__file__), "import-pdl.py")
    if os.path.exists(script_local):
        sftp = client.open_sftp()
        sftp.put(script_local, "/data/pdl/import-pdl.py")
        sftp.close()
        print("Uploaded import-pdl.py")

    # Start import
    stdin, stdout, stderr = client.exec_command(
        "nohup python3 /data/pdl/import-pdl.py > /data/pdl/import-pdl.log 2>&1 & echo $!"
    )
    pid = stdout.read().decode().strip()
    print(f"PDL import started on VPS (PID {pid})")
    print("Monitor: ssh root@89.117.51.235 && tail -f /data/pdl/import-pdl.log")
    client.close()

if __name__ == "__main__":
    main()

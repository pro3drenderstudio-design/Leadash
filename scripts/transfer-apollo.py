"""
Transfer Apollo files to VPS using on-the-fly gzip compression.
Transfers in 2 GB source-chunks, each with its own SSH connection.
Each chunk appends to the remote file via gunzip, so a dropped
connection loses at most ~2 GB and resumes from the last checkpoint.

Usage:
  python scripts/transfer-apollo.py orgs
  python scripts/transfer-apollo.py people
  python scripts/transfer-apollo.py both
"""
import paramiko, sys, time, os, zlib, json

HOST = "89.117.51.235"
USER = "root"
PASS = "M6161505c"

APOLLO_DIR = r"C:\Users\Abdul Malik\Downloads\Entire Apollo Database 99,311,285-001\Entire Apollo Database 99,311,285"
FILES = {
    "orgs":   (os.path.join(APOLLO_DIR, "Apollo_V7_V5_org_all_fields 6,071,657.csv"),   "/data/apollo/apollo_orgs.csv"),
    "people": (os.path.join(APOLLO_DIR, "Apollo_V7_V5_per_all_fields 93,239,628.csv"), "/data/apollo/apollo_people.csv"),
}

CHUNK_BYTES = 2 * 1024 ** 3   # 2 GB of raw source data per connection
READ_CHUNK  = 1 << 20          # 1 MB read buffer


def connect():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASS, timeout=30, banner_timeout=30)
    client.get_transport().set_keepalive(30)   # SSH keepalive every 30 s
    return client


def checkpoint_path(local):
    return local + ".xfer_checkpoint"


def load_checkpoint(local):
    path = checkpoint_path(local)
    if os.path.exists(path):
        with open(path) as f:
            return int(f.read().strip())
    return 0


def save_checkpoint(local, byte_pos):
    with open(checkpoint_path(local), "w") as f:
        f.write(str(byte_pos))


def transfer_compressed(local, remote):
    total_size = os.path.getsize(local)
    size_gb    = total_size / 1e9
    name       = os.path.basename(local)

    start_byte = load_checkpoint(local)
    if start_byte:
        print(f"\n{name}: resuming from {start_byte/1e9:.2f} GB / {size_gb:.1f} GB")
    else:
        print(f"\n{name}: {size_gb:.1f} GB -> {remote}")

    t_total = time.time()

    while start_byte < total_size:
        chunk_end  = min(start_byte + CHUNK_BYTES, total_size)
        chunk_num  = start_byte // CHUNK_BYTES + 1
        total_chunks = (total_size + CHUNK_BYTES - 1) // CHUNK_BYTES
        is_first   = start_byte == 0

        print(f"\n  Chunk {chunk_num}/{total_chunks}: "
              f"{start_byte/1e9:.2f} GB -> {chunk_end/1e9:.2f} GB")

        try:
            client  = connect()
            chan    = client.get_transport().open_session()
            # First chunk creates the file; subsequent chunks append their
            # decompressed output — gzip member concatenation is valid.
            redirect = ">" if is_first else ">>"
            chan.exec_command(f"gunzip -c {redirect} {remote}")

            compressor = zlib.compressobj(1, zlib.DEFLATED, 31)
            sent_bytes = 0
            pos        = start_byte
            t0         = time.time()
            last_print = time.time()

            with open(local, "rb") as f:
                f.seek(start_byte)
                remaining = chunk_end - start_byte

                while remaining > 0:
                    raw = f.read(min(READ_CHUNK, remaining))
                    if not raw:
                        break
                    remaining  -= len(raw)
                    pos        += len(raw)
                    compressed  = compressor.compress(raw)
                    if compressed:
                        chan.sendall(compressed)
                        sent_bytes += len(compressed)

                    now = time.time()
                    if now - last_print >= 10:
                        last_print  = now
                        elapsed     = max(now - t0, 1)
                        chunk_read  = pos - start_byte
                        pct_overall = pos / total_size * 100
                        pct_chunk   = chunk_read / (chunk_end - start_byte) * 100
                        speed_mb    = sent_bytes / elapsed / 1e6
                        ratio       = sent_bytes / chunk_read if chunk_read else 0.44
                        remaining_bytes = total_size - pos
                        eta_min = int(remaining_bytes * ratio / max(sent_bytes / elapsed, 1) / 60)
                        print(f"  {pct_overall:5.1f}% overall | chunk {pct_chunk:4.1f}% | "
                              f"{pos/1e9:.2f}/{size_gb:.1f} GB | "
                              f"{speed_mb:.2f} MB/s | ETA ~{eta_min}min")

                # Flush gzip stream for this chunk
                final = compressor.flush()
                if final:
                    chan.sendall(final)
                    sent_bytes += len(final)

            chan.shutdown_write()
            while not chan.exit_status_ready():
                time.sleep(0.5)

            exit_code = chan.recv_exit_status()
            client.close()

            if exit_code != 0:
                print(f"  WARNING: gunzip exited {exit_code} — retrying chunk in 15s")
                time.sleep(15)
                continue

            # Chunk done — save checkpoint
            save_checkpoint(local, chunk_end)
            start_byte = chunk_end

            elapsed_chunk = time.time() - t0
            print(f"  Chunk done: {sent_bytes/1e6:.0f} MB sent in {elapsed_chunk/60:.1f} min")

        except (EOFError, OSError, paramiko.SSHException) as e:
            safe_pos = locals().get("pos", start_byte)
            safe_raw = locals().get("raw", b"")
            resume_at = max(start_byte, safe_pos - len(safe_raw))
            print(f"  Connection error: {e}")
            print(f"  Saving checkpoint at {resume_at/1e9:.2f} GB, reconnecting in 15 s...")
            save_checkpoint(local, resume_at)
            time.sleep(15)
            start_byte = load_checkpoint(local)
            is_first   = start_byte == 0

    # All chunks done
    if os.path.exists(checkpoint_path(local)):
        os.remove(checkpoint_path(local))

    elapsed = time.time() - t_total
    print(f"\n  {name} complete in {elapsed/3600:.1f} hr")


mode = sys.argv[1] if len(sys.argv) > 1 else "both"

if mode == "orgs":
    transfer_compressed(*FILES["orgs"])
elif mode == "people":
    transfer_compressed(*FILES["people"])
elif mode == "both":
    transfer_compressed(*FILES["orgs"])
    transfer_compressed(*FILES["people"])
else:
    print("Usage: python transfer-apollo.py [orgs|people|both]")
    sys.exit(1)

print("\nAll done. SSH to VPS and run:")
print("  python3 /data/import-apollo.py people /data/apollo/apollo_people.csv")

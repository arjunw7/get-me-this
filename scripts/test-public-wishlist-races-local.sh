#!/usr/bin/env bash
# Exact local-stack, multi-session proof. Never prints bearer tokens or SQL.
# Synthetic random-ID fixtures only; cleanup is scoped to those IDs on every exit.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python3 - "${PUBLIC_WISHLIST_TEST_CONFIG:-$repo_root/supabase/config.toml}" <<'PY'
import json
import queue
import re
import subprocess
import sys
import threading
import time
import uuid

config = open(sys.argv[1], encoding="utf-8").read()
match = re.search(r'^project_id\s*=\s*"([^"]+)"', config, re.MULTILINE)
if not match:
    sys.exit("Could not identify this repository's local database")
project = match.group(1)
container = "supabase_db_" + project
try:
    inspected = subprocess.run(["docker", "inspect", container], capture_output=True, text=True, check=True, timeout=10)
    metadata = json.loads(inspected.stdout)[0]
    if not metadata["State"]["Running"] or metadata["Config"]["Labels"].get("com.supabase.cli.project") != project:
        raise ValueError("wrong local database")
except Exception:
    sys.exit("The exact local Supabase database is unavailable")
base = ["docker", "exec", "-i", container, "psql", "--no-psqlrc", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"]

def sql(statement):
    result = subprocess.run(base, input=statement, capture_output=True, text=True, timeout=20)
    if result.returncode:
        raise RuntimeError("Local fixture/assertion SQL failed (details suppressed to protect capabilities)")
    return result.stdout.strip()

class Session:
    def __init__(self, label):
        self.label = label
        self.process = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        self.output = queue.Queue()
        def reader():
            for line in self.process.stdout:
                self.output.put(line.rstrip("\n"))
            self.output.put(None)
        threading.Thread(target=reader, daemon=True).start()
        self.run("set application_name = '" + label + "'; set statement_timeout = '15s'; set lock_timeout = '12s';")
    def send(self, statement):
        marker = "barrier_" + uuid.uuid4().hex
        self.process.stdin.write(statement + "\n\\echo " + marker + "\n")
        self.process.stdin.flush()
        return marker
    def finish(self, marker):
        lines = []
        deadline = time.monotonic() + 18
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise RuntimeError("Session barrier timed out")
            line = self.output.get(timeout=remaining)
            if line is None:
                raise RuntimeError("Local database session exited unexpectedly")
            if line == marker:
                return lines
            lines.append(line)
    def run(self, statement):
        return self.finish(self.send(statement))
    def close(self):
        if self.process.poll() is None:
            try:
                self.process.stdin.write("rollback;\n\\q\n")
                self.process.stdin.flush()
                self.process.wait(timeout=3)
            except Exception:
                self.process.kill()
                self.process.wait(timeout=3)

def blocked(session):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if sql("select count(*) from pg_stat_activity where application_name='" + session.label + "' and wait_event_type='Lock';") == "1":
            return
        time.sleep(0.05)
    raise RuntimeError("Expected independent transaction did not block")

def expect(condition, label):
    if not condition:
        raise RuntimeError(label)

owner, viewer, other, item = [str(uuid.uuid4()) for _ in range(4)]
tag = "public_share_race_" + uuid.uuid4().hex[:12]
sessions = []
created = False

def prepare(session, actor):
    # Capture the capability as a psql variable while privileged, without printing it.
    session.run("reset role; select l.share_token as race_token from private.wishlist_public_links l join public.wishlists w on w.id=l.wishlist_id where w.owner_id='" + owner + "' \\gset\nset role authenticated; set request.jwt.claim.sub='" + actor + "'; set request.jwt.claims='" + json.dumps({"sub": actor, "role": "authenticated"}) + "';")

def enable(version):
    sql("begin; set local role authenticated; set local request.jwt.claim.sub='" + owner + "'; select count(*) from public.enable_wishlist_share(" + str(version) + "); commit;")

try:
    created = True
    sql("begin; insert into auth.users(id,aud,role,email,encrypted_password) values " + ",".join("('" + user + "','authenticated','authenticated','" + user + "@public-race.example.invalid','')" for user in [owner, viewer, other]) + "; insert into public.wishlist_items(id,wishlist_id,owner_id,title,sort_position,extraction_status) select '" + item + "',id,owner_id,'Race fixture',1,'manual' from public.wishlists where owner_id='" + owner + "'; commit;")
    a = Session(tag + "_a")
    sessions.append(a)
    b = Session(tag + "_b")
    sessions.append(b)

    # Revocation wins: the waiting writer must recheck the now-disabled link.
    prepare(a, owner); prepare(b, viewer)
    a.run("begin; select enabled from public.revoke_wishlist_share(0);")
    pending = b.send("begin; select count(*) from public.set_public_wishlist_reaction(:'race_token','" + item + "','very_you'); commit;")
    blocked(b)
    a.run("commit;")
    expect("0" in b.finish(pending), "Writer waiting behind committed revocation was not denied")
    expect(sql("select count(*) from public.public_wishlist_item_reactions where item_id='" + item + "';") == "0", "Revoked capability wrote a reaction")
    print("PASS revocation before reaction denies waiting writer")

    # Reaction wins: revocation waits for its shared capability lock, then disables.
    enable(1)
    prepare(a, viewer); prepare(b, owner)
    a.run("begin; select count(*) from public.set_public_wishlist_reaction(:'race_token','" + item + "','very_you');")
    pending = b.send("begin; select enabled from public.revoke_wishlist_share(2); commit;")
    blocked(b)
    a.run("commit;")
    expect("f" in b.finish(pending), "Waiting revocation did not disable the link")
    expect(sql("select count(*) from public.public_wishlist_item_reactions where item_id='" + item + "';") == "1", "Committed-before-revoke reaction was lost")
    print("PASS reaction before revocation commits in a defined order")

    # Two public users serialize through the item lock; second sees committed counts.
    enable(3)
    prepare(a, viewer); prepare(b, other)
    a.run("begin; select count(*) from public.set_public_wishlist_reaction(:'race_token','" + item + "','want_it_too');")
    pending = b.send("begin; select very_you_count||':'||questionable_count||':'||want_it_too_count from public.set_public_wishlist_reaction(:'race_token','" + item + "','questionable'); commit;")
    blocked(b)
    a.run("commit;")
    expect("0:1:1" in b.finish(pending), "Second writer did not see authoritative serialized counts")
    print("PASS concurrent reactions preserve unique context and authoritative counts")

    # Concurrent stale owner controls cannot change the newer share version.
    prepare(a, owner); prepare(b, owner)
    a.run("begin; select enabled from public.revoke_wishlist_share(4);")
    pending = b.send("begin; select count(*) from public.enable_wishlist_share(4); commit;")
    blocked(b)
    a.run("commit;")
    expect("0" in b.finish(pending), "Stale waiting enable resurrected a revoked link")
    expect(sql("select enabled::text||':'||version from private.wishlist_public_links l join public.wishlists w on w.id=l.wishlist_id where w.owner_id='" + owner + "';") == "false:5", "Unexpected final capability version")
    print("PASS concurrent stale enable cannot resurrect revoked capability")

    # A deleted item cannot receive a reaction after the delete commits.
    enable(5)
    prepare(a, owner); prepare(b, viewer)
    a.run("begin; delete from public.wishlist_items where id='" + item + "';")
    pending = b.send("begin; select count(*) from public.set_public_wishlist_reaction(:'race_token','" + item + "','very_you'); commit;")
    blocked(b)
    a.run("commit;")
    expect("0" in b.finish(pending), "Writer waiting behind item deletion was not denied")
    print("PASS deletion before reaction denies waiting writer")
except Exception as error:
    # Never echo query text, database diagnostics, or captured capability material.
    print("FAIL " + (str(error) if isinstance(error, RuntimeError) else "local race harness could not finish"), file=sys.stderr)
    sys.exit(1)
finally:
    for session in sessions:
        session.close()
    if created:
        try:
            sql("delete from auth.users where id in ('" + owner + "','" + viewer + "','" + other + "');")
        except Exception:
            print("Exact-ID race fixture cleanup failed for: " + ", ".join([owner, viewer, other]), file=sys.stderr)
            sys.exit(1)
PY

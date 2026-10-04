"""Local-only two-session deletion races. No credentials or tokens are printed."""

import re
import subprocess
import time
import uuid
from pathlib import Path


root = Path(__file__).resolve().parent.parent
project = re.search(r'^project_id = "([^"]+)"', (root / "supabase/config.toml").read_text(), re.M)[1]
container = f"supabase_db_{project}"
running = subprocess.check_output(
    ["docker", "ps", "--filter", f"label=com.supabase.cli.project={project}", "--format", "{{.Names}}"], text=True
).splitlines()
assert container in running, "Start this checkout's local Supabase stack first"
command = ["docker", "exec", "-i", container, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]


def query(sql):
    return subprocess.run(command, input=sql, text=True, capture_output=True, check=True, timeout=20).stdout.strip()


def identity(actor):
    return f"set local role authenticated; set local request.jwt.claim.sub='{actor}';"


def race(first_kind, second_kind, expected):
    owner, member, group = (str(uuid.uuid4()) for _ in range(3))
    tag = f"delete-race-{group}"
    first = second = None
    try:
        query(f"""
          insert into auth.users(id,aud,role,email,encrypted_password) values
          ('{owner}','authenticated','authenticated','{owner}@example.invalid',''),
          ('{member}','authenticated','authenticated','{member}@example.invalid','');
          insert into public.groups(id,name,occasion,occasion_at,time_zone,mode,organizer_id)
          values ('{group}','Race fixture','Birthday','2027-11-07','UTC','wishlist_only','{owner}');
          insert into public.group_members(group_id,user_id,status,participating,membership_generation)
          values ('{group}','{owner}','joined',true,1),('{group}','{member}','joined',true,1);
        """)
        operations = {
            "delete": f"select public.delete_group('{group}',0);",
            "transfer": f"select count(*) from public.transfer_group_organizer('{group}','{member}',0);",
            "remove": f"select count(*) from public.remove_group_member('{group}','{member}',0);",
        }
        # Session A executes its mutation but holds the group lock until
        # session B is proven waiting on that lock in pg_stat_activity.
        first = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        first.stdin.write(f"begin; set local statement_timeout='15s'; {identity(owner)} {operations[first_kind]}\n")
        first.stdin.flush()
        second = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        # Wait for A to finish the statement while leaving its transaction open.
        deadline = time.monotonic() + 10
        while query(f"select count(*) from pg_stat_activity where state='idle in transaction' and query like '%{group}%' and pid<>pg_backend_pid();") != "1":
            assert time.monotonic() < deadline, "first session did not reach its lock barrier"
            time.sleep(0.05)
        second.stdin.write(f"set application_name='{tag}'; begin; set local statement_timeout='15s'; {identity(owner)} {operations[second_kind]} commit;\n")
        second.stdin.flush()
        deadline = time.monotonic() + 10
        while query(f"select count(*) from pg_stat_activity where application_name='{tag}' and wait_event_type='Lock';") != "1":
            assert time.monotonic() < deadline, "second session did not contend on the group lock"
            time.sleep(0.05)
        first.stdin.write("commit;\n")
        first.stdin.flush()
        first.communicate(timeout=20)
        assert first.returncode == 0, "first mutation failed"
        output, error = second.communicate(timeout=20)
        if expected == "stale":
            assert second.returncode != 0 and "stale_member_admin_version" in error, "expected stale-version rejection"
        else:
            assert second.returncode == 0 and output.strip() == expected, "expected generic authority denial"
        state = query(f"select status||':'||member_admin_version::text from public.groups where id='{group}';")
        assert state == ("deleted:1" if first_kind == "delete" else "active:1"), "loser changed the group"
        audit = query(f"select count(*) from public.audit_events where group_id='{group}' and event_type='group_deleted';")
        assert audit == ("1" if first_kind == "delete" else "0"), "duplicate or unauthorized deletion audit"
        print(f"PASS {first_kind} / {second_kind}: waiting caller rechecks committed authority/version")
    finally:
        for process in (first, second):
            if process is not None and process.poll() is None:
                process.kill()
                process.wait(timeout=20)
        query(f"""
          delete from public.audit_events where group_id='{group}';
          delete from public.group_members where group_id='{group}';
          delete from public.groups where id='{group}';
          delete from auth.users where id in ('{owner}','{member}');
        """)


race("delete", "delete", "f")
race("transfer", "delete", "f")
race("delete", "transfer", "stale")
race("remove", "delete", "stale")

#!/usr/bin/env python3
"""
Writes ProgressX's env files from Vault (secret/progressx/*). Used by the Ansible deploy and by CI, and
handy for setting up a local copy. Values are never printed.

  vault-fetch.py env   <secret path> <output file>   KEY='value' lines, e.g. env progressx/AppEnvLocal progressx/.env.local
  vault-fetch.py files <secret path> <output dir>    each key is a file name, its value the file's contents
  vault-fetch.py value <secret path> <key> <output file>   one key's value on its own (trailing newline removed)

Login, in this order:
  - VAULT_TOKEN (+ VAULT_ADDR): e.g. after `vault login -method=userpass` on another computer
  - the read-only "progressx-deploy" AppRole in ~/.progressx/vault-approle.json (or $VAULT_APPROLE_FILE)
Output files are created with mode 600. Standard library only.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

ENV_KEY = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
FILE_NAME = re.compile(r"^[A-Za-z0-9._-]+$")


def fail(message):
    sys.exit(f"vault-fetch: {message}")


def request(addr, path, token=None, body=None):
    req = urllib.request.Request(f"{addr.rstrip('/')}/v1/{path}", data=json.dumps(body).encode() if body is not None else None,
                                 method="POST" if body is not None else "GET", headers={"Content-Type": "application/json"})
    if token:
        req.add_header("X-Vault-Token", token)
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        fail(f"Vault refused {path} ({e.code})")  # the response body is not shown: it could echo input
    except urllib.error.URLError as e:
        fail(f"can't reach Vault at {addr} ({e.reason}); is it running and unsealed?")


def login():
    if os.environ.get("VAULT_TOKEN"):
        return os.environ.get("VAULT_ADDR", "http://127.0.0.1:8200"), os.environ["VAULT_TOKEN"]
    path = os.environ.get("VAULT_APPROLE_FILE", os.path.expanduser("~/.progressx/vault-approle.json"))
    try:
        creds = json.load(open(path))
    except OSError:
        fail(f"no VAULT_TOKEN and no AppRole credentials at {path}")
    addr = creds.get("vault_addr", "http://127.0.0.1:8200")
    auth = request(addr, "auth/approle/login", body={"role_id": creds["role_id"], "secret_id": creds["secret_id"]})["auth"]
    return addr, auth["client_token"]


def write_private(path, text):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = f"{path}.tmp-{os.getpid()}"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(text)
    os.replace(tmp, path)  # atomic: a reader never sees a half-written file
    os.chmod(path, 0o600)


def main():
    args = sys.argv[1:]
    if not ((len(args) == 3 and args[0] in ("env", "files")) or (len(args) == 4 and args[0] == "value")):
        fail("usage: vault-fetch.py env|files <secret path> <output>, or value <secret path> <key> <output> (see the top of this file)")
    kind, secret, out = args[0], args[1], args[-1]
    if not re.match(r"^[A-Za-z0-9_/.-]+$", secret) or ".." in secret:
        fail("bad secret path")
    addr, token = login()
    data = request(addr, f"secret/data/{secret}", token)["data"]["data"]
    if not data:
        fail(f"secret/{secret} is empty")

    if kind == "value":
        key = args[2]
        if key not in data:
            fail(f"secret/{secret} has no key {key}")
        write_private(out, str(data[key]).rstrip("\n"))
        print(f"wrote {key} from secret/{secret} to {out}")
    elif kind == "env":
        # single-quoted, so Docker Compose and dotenv both take the value literally (no $VAR expansion,
        # no " #" comments); a value that itself contains ' or a new line can't be written that way
        bad = [k for k, v in data.items() if not ENV_KEY.match(k) or not isinstance(v, str) or "\n" in v or "'" in v]
        if bad:
            fail(f"can't write as an env file (a value contains ' or a new line, or isn't text): {', '.join(bad)}")
        write_private(out, "".join(f"{k}='{v}'\n" for k, v in data.items()))
        print(f"wrote {len(data)} keys from secret/{secret} to {out}")
    else:
        bad = [k for k, v in data.items() if not FILE_NAME.match(k) or not isinstance(v, str)]
        if bad:
            fail(f"not usable as files (bad name, or the value isn't text): {', '.join(bad)}")
        for name, contents in data.items():
            write_private(os.path.join(out, name), contents)
        print(f"wrote {len(data)} files from secret/{secret} to {out}/")


if __name__ == "__main__":
    main()

# Read-only metadata extraction for the kit index. Two modes:
#   python frappe_meta.py constants <bench>   -> custom fields declared in app code (*CUSTOM_FIELDS dicts)
#   bench --site <site> execute ... is used by index.mjs for live site metadata instead.
# Prints JSON on stdout. Never writes anything, never connects to a site.
import importlib
import json
import os
import re
import sys

def constants(bench):
    out = []
    apps_dir = os.path.join(bench, "apps")
    pat = re.compile(r"^[A-Z_]*CUSTOM_FIELDS\s*=", re.M)
    for app in sorted(os.listdir(apps_dir)):
        root = os.path.join(apps_dir, app, app)
        if not os.path.isdir(root):
            continue
        for dirpath, dirnames, files in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in ("node_modules", "public", "tests", "__pycache__", "doctype")]
            for f in files:
                if not f.endswith(".py"):
                    continue
                p = os.path.join(dirpath, f)
                try:
                    src = open(p, encoding="utf-8").read()
                except Exception:
                    continue
                if not pat.search(src):
                    continue
                mod = os.path.relpath(p, os.path.join(apps_dir, app))[:-3].replace(os.sep, ".")
                try:
                    m = importlib.import_module(mod)
                except Exception as e:
                    out.append({"app": app, "module": mod, "error": str(e)[:200]})
                    continue
                for name, val in vars(m).items():
                    if not (name.endswith("CUSTOM_FIELDS") and isinstance(val, dict)):
                        continue
                    for key, fields in val.items():
                        dts = list(key) if isinstance(key, (tuple, list)) else [key]
                        if isinstance(fields, dict):
                            fields = [fields]
                        for fd in fields or []:
                            if not isinstance(fd, dict) or not fd.get("fieldname"):
                                continue
                            for dt in dts:
                                out.append({
                                    "app": app, "dt": dt, "f": fd.get("fieldname"), "l": fd.get("label") or "",
                                    "t": fd.get("fieldtype") or "", "o": str(fd.get("options") or "")[:80],
                                    "src": mod,
                                })
    print(json.dumps(out))

if __name__ == "__main__":
    if sys.argv[1] == "constants":
        constants(sys.argv[2])

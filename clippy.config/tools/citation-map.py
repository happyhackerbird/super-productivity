#!/usr/bin/env python3
"""Citation-disposition map for a Clippy run.

Resolves every `path:line` / `path:from-to` citation found in the given
design files at a base revision and in the current tree, and prints one
line per citation: SAME, MOVED (new line), CONTENT-CHANGED, or UNRESOLVED.

usage: citation-map.py <repo> <base-rev> <design-file>...

A citation's path may be a full repo path or a unique trailing part of one
(the tracker often writes `capture-mcp.routes.ts:50-55`); an ambiguous or
unknown name is UNRESOLVED and says why. Citations of files that did not
exist at the base (the run's own new files) are skipped as NEW.
"""
import re
import subprocess
import sys


def git(repo, *args):
    r = subprocess.run(['git', '-C', repo, *args], capture_output=True, text=True)
    return r.returncode, r.stdout


def main():
    repo, base, files = sys.argv[1], sys.argv[2], sys.argv[3:]
    _, out = git(repo, 'ls-tree', '-r', '--name-only', base)
    base_files = out.splitlines()
    _, out = git(repo, 'ls-files')
    head_files = set(out.splitlines())
    cite = re.compile(r'`?((?:[\w.@-]+/)*[\w.@-]+\.[A-Za-z]{1,6}):(\d+)(?:-(\d+))?')
    seen = {}
    for f in files:
        for m in cite.finditer(open(f).read()):
            key = (m.group(1), int(m.group(2)), int(m.group(3) or m.group(2)))
            seen.setdefault(key, f)
    counts = {}
    for (name, a, b), _src in sorted(seen.items()):
        cands = [p for p in base_files if p == name or p.endswith('/' + name)]
        if not cands:
            status = 'NEW' if any(p == name or p.endswith('/' + name) for p in head_files) else 'UNRESOLVED (no such file)'
        elif len(cands) > 1:
            status = 'UNRESOLVED (ambiguous: %d files)' % len(cands)
        else:
            path = cands[0]
            _, base_txt = git(repo, 'show', '%s:%s' % (base, path))
            base_lines = base_txt.splitlines()
            if path not in head_files:
                status = 'CONTENT-CHANGED (file removed)'
            else:
                head_lines = open('%s/%s' % (repo, path)).read().splitlines()
                want = base_lines[a - 1:b]
                if not want:
                    status = 'UNRESOLVED (line range beyond base file)'
                elif head_lines[a - 1:b] == want:
                    status = 'SAME'
                else:
                    n = len(want)
                    hits = [i + 1 for i in range(len(head_lines) - n + 1) if head_lines[i:i + n] == want]
                    if len(hits) == 1:
                        status = 'MOVED -> %d' % hits[0]
                    elif len(hits) > 1:
                        status = 'MOVED (%d candidates, nearest %d)' % (len(hits), min(hits, key=lambda h: abs(h - a)))
                    else:
                        status = 'CONTENT-CHANGED'
            name = path
        counts[status.split(' ')[0]] = counts.get(status.split(' ')[0], 0) + 1
        rng = str(a) if a == b else '%d-%d' % (a, b)
        print('%-60s %s:%s' % (status, name, rng))
    print('# totals: ' + ', '.join('%s %d' % kv for kv in sorted(counts.items())))


if __name__ == '__main__':
    main()

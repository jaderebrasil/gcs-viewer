#!/usr/bin/env python3
"""Generate README.md from README.template.md, expanding <!-- gcs-list --> directives."""

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent

DIRECTIVE_RE = re.compile(r'<!--\s*gcs-list\s*\n(.*?)-->', re.DOTALL)
YELLOW = '\033[1;33m'
RESET = '\033[0m'


def parse_config(block):
    config = {}
    for line in block.strip().splitlines():
        if '=' in line:
            k, _, v = line.partition('=')
            config[k.strip()] = v.strip()
    return config


def character_name(gcs_path):
    with open(gcs_path) as f:
        return json.load(f)['profile']['name']


def expand_directive(config):
    chars_dir = ROOT / config['path']
    base_url  = config['base_url'].rstrip('/')
    lines = []
    for gcs in sorted(chars_dir.glob('*.gcs')):
        name = character_name(gcs)
        lines.append(f'- [{name}]({base_url}/{gcs.name})')
    return '\n'.join(lines)


def warn(message):
    border = '!' * 72
    print(f'{YELLOW}\n{border}\nWARNING: {message}\n{border}\n{RESET}', file=sys.stderr)


def build_html(readme_path):
    smu = shutil.which('smu')
    out_path = ROOT / 'public' / 'readme.html'

    if not smu:
        warn('smu not found; public/readme.html was not generated.')
        return

    try:
        result = subprocess.run(
            [smu, str(readme_path)],
            check=True,
            capture_output=True,
            text=True,
        )
        out_path.write_text(result.stdout)
    except (OSError, subprocess.CalledProcessError) as exc:
        detail = exc.stderr.strip() if isinstance(exc, subprocess.CalledProcessError) and exc.stderr else str(exc)
        warn(f'could not generate public/readme.html with smu: {detail}')
        return

    print(f'Written → {out_path}')


def main():
    template = (ROOT / 'scripts' / 'README.template.md').read_text()

    def replace(m):
        config = parse_config(m.group(1))
        return expand_directive(config)

    output = DIRECTIVE_RE.sub(replace, template)
    out_path = ROOT / 'README.md'
    out_path.write_text(output)
    print(f'Written → {out_path}')
    build_html(out_path)


if __name__ == '__main__':
    main()

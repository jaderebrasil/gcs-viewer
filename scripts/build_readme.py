#!/usr/bin/env python3
"""Generate README.md from README.template.md, expanding <!-- gcs-list --> directives."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent

DIRECTIVE_RE = re.compile(r'<!--\s*gcs-list\s*\n(.*?)-->', re.DOTALL)


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


def main():
    template = (ROOT / 'scripts' / 'README.template.md').read_text()

    def replace(m):
        config = parse_config(m.group(1))
        return expand_directive(config)

    output = DIRECTIVE_RE.sub(replace, template)
    out_path = ROOT / 'README.md'
    out_path.write_text(output)
    print(f'Written → {out_path}')


if __name__ == '__main__':
    main()

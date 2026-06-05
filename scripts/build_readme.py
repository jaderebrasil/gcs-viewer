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
STATS_DIRECTIVE_RE = re.compile(r'<!--\s*gcs-stats\s*\n(.*?)-->', re.DOTALL)
YELLOW = '\033[1;33m'
RESET = '\033[0m'


def clean_player_name(name):
    return name.split('\\')[-1] if '\\' in name else name


def escape_markdown(s):
    return re.sub(r'([\\`*_{}\[\]()#+\-.!|>~])', r'\\\1', s)


def parse_config(block):
    config = {}
    for line in block.strip().splitlines():
        if '=' in line:
            k, _, v = line.partition('=')
            config[k.strip()] = v.strip()
    return config


def expand_directive(config):
    chars_dir = ROOT / config['path']
    base_url  = config['base_url'].rstrip('/')
    fmt = config.get('format', 'basic')
    lines = []
    for gcs in sorted(chars_dir.glob('*.gcs')):
        with open(gcs) as f:
            data = json.load(f)
        name = data['profile']['name']
        if fmt == 'full':
            player = data['profile'].get('player_name', '')
            player = escape_markdown(clean_player_name(player))
            points = data.get('total_points', 0)
            lines.append(f'- [{name} ({points})]({base_url}/{gcs.name}) - by {player}')
        else:
            lines.append(f'- [{name}]({base_url}/{gcs.name})')
    return '\n'.join(lines)


def get_attr_value(data, attr_id):
    for attr in data.get('attributes', []):
        if attr.get('attr_id') == attr_id:
            return attr.get('calc', {}).get('value', 0)
    return 0


def get_torso_dr(data):
    base_dr = 0
    for loc in data.get('settings', {}).get('body_type', {}).get('locations', []):
        if loc.get('id') == 'torso':
            base_dr = loc.get('calc', {}).get('dr', {}).get('all', 0)
            break
    equip_dr = 0
    for item in data.get('equipment', []):
        if not item.get('equipped'):
            continue
        for feat in item.get('features', []):
            if feat.get('type') == 'dr_bonus' and feat.get('location') == 'torso':
                equip_dr += feat.get('amount', 0)
    return base_dr + equip_dr


def fmt_stat(label, entries):
    if not entries:
        return ''
    vals = [v for _, v in entries]
    avg = sum(vals) / len(vals)
    min_name, min_val = min(entries, key=lambda e: e[1])
    max_name, max_val = max(entries, key=lambda e: e[1])
    return (
        f'- **{label}:** {min_val} | {avg:.0f} | {max_val} ({min_name} | {max_name})'
    )


def expand_stats(config):
    chars_dir = ROOT / config['path']
    entries = []
    hp_entries = []
    fp_entries = []
    dr_entries = []
    for gcs in sorted(chars_dir.glob('*.gcs')):
        with open(gcs) as f:
            data = json.load(f)
        name = data['profile']['name']
        entries.append((name, data.get('total_points', 0)))
        hp_entries.append((name, get_attr_value(data, 'hp')))
        fp_entries.append((name, get_attr_value(data, 'fp')))
        dr_entries.append((name, get_torso_dr(data)))
    if not entries:
        return '*No characters found.*'
    points = [p for _, p in entries]
    avg = sum(points) / len(points)
    min_name, min_pts = min(entries, key=lambda e: e[1])
    max_name, max_pts = max(entries, key=lambda e: e[1])
    lines = [
        f'- **Active Characters:** {len(entries)}',
        f'- **Points:** {min_pts} | {avg:.0f} | {max_pts} ({min_name} | {max_name})',
        '',
        fmt_stat('HP', hp_entries),
        fmt_stat('FP', fp_entries),
        fmt_stat('DR (torso)', dr_entries),
        '',
    ]
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

    def replace_stats(m):
        config = parse_config(m.group(1))
        return expand_stats(config)

    output = DIRECTIVE_RE.sub(replace, template)
    output = STATS_DIRECTIVE_RE.sub(replace_stats, output)
    out_path = ROOT / 'README.md'
    out_path.write_text(output)
    print(f'Written → {out_path}')
    build_html(out_path)


if __name__ == '__main__':
    main()

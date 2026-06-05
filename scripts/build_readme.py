#!/usr/bin/env python3
"""Generate README.md from README.template.md, expanding <!-- gcs-list --> directives."""

import json
import re
import sys
from html import escape as html_escape
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


def fmt_stat(label, entries, col_width=14):
    if not entries:
        return ''
    avg = sum(entries) / len(entries)
    min_val = min(entries)
    max_val = max(entries)
    label_str = f'**{label}:**'
    return (
        f'| {label_str:<{col_width}} | {min_val:>6} | {avg:>6.0f} | {max_val:>6} |'
    )


def expand_stats(config):
    chars_dir = ROOT / config['path']
    entries = {
        'Points': [],
        'HP': [],
        'FP': [],
        'DR (torso)': []
    }
    for gcs in sorted(chars_dir.glob('*.gcs')):
        with open(gcs) as f:
            data = json.load(f)
        entries['Points'].append(data.get('total_points', 0))
        entries['HP'].append(get_attr_value(data, 'hp'))
        entries['FP'].append(get_attr_value(data, 'fp'))
        entries['DR (torso)'].append(get_torso_dr(data))
    if not entries['Points']:
        return '*No characters found.*'
    
    max_label_len = max(len(f'**{l}:**') for l in entries.keys())
    col_width = max_label_len + 2  # padding
    
    header = f'| {"Stat":<{col_width}} |    Min |    Avg |    Max |'
    separator = f'|:{"-" * (col_width + 1)}|-------:|-------:|-------:|'
    
    lines = [
        f'- **Active Characters:** {len(entries["Points"])}',
        '',
        header,
        separator,
        *[fmt_stat(key, entr, col_width) for (key, entr) in entries.items()],
        '',
    ]
    return '\n'.join(lines)


def warn(message):
    border = '!' * 72
    print(f'{YELLOW}\n{border}\nWARNING: {message}\n{border}\n{RESET}', file=sys.stderr)


INLINE_RE = re.compile(r'(\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))')


def _inline(text):
    def repl(m):
        if m.group(2):
            return f'<strong>{html_escape(m.group(2))}</strong>'
        if m.group(3):
            return f'<code>{html_escape(m.group(3))}</code>'
        return f'<a href="{html_escape(m.group(5))}">{html_escape(m.group(4))}</a>'
    return INLINE_RE.sub(repl, text)


def _parse_table(lines):
    rows = []
    for line in lines:
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        rows.append(cells)
    if len(rows) < 2:
        return ''
    header = rows[0]
    alignments = []
    for cell in rows[1]:
        if cell.startswith(':') and cell.endswith(':'):
            alignments.append('center')
        elif cell.endswith(':'):
            alignments.append('right')
        elif cell.startswith(':'):
            alignments.append('left')
        else:
            alignments.append('')
    body_rows = rows[2:]
    parts = ['<table>']
    parts.append('<thead><tr>')
    for i, cell in enumerate(header):
        align = f' style="text-align:{alignments[i]}"' if i < len(alignments) and alignments[i] else ''
        parts.append(f'<th{align}>{_inline(cell)}</th>')
    parts.append('</tr></thead>')
    parts.append('<tbody>')
    for row in body_rows:
        parts.append('<tr>')
        for i, cell in enumerate(row):
            align = f' style="text-align:{alignments[i]}"' if i < len(alignments) and alignments[i] else ''
            parts.append(f'<td{align}>{_inline(cell)}</td>')
        parts.append('</tr>')
    parts.append('</tbody></table>')
    return '\n'.join(parts)


def markdown_to_html(md_text):
    lines = md_text.splitlines()
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]

        m = re.match(r'^(#{1,3})\s+(.*)', line)
        if m:
            level = len(m.group(1))
            out.append(f'<h{level}>{_inline(m.group(2))}</h{level}>')
            i += 1
            continue

        if re.match(r'^-{3,}\s*$', line):
            out.append('<hr>')
            i += 1
            continue

        if line.startswith('|') and i + 1 < len(lines) and lines[i + 1].startswith('|'):
            table_lines = []
            while i < len(lines) and lines[i].startswith('|'):
                table_lines.append(lines[i])
                i += 1
            out.append(_parse_table(table_lines))
            continue

        if line.startswith('- '):
            items = []
            while i < len(lines) and lines[i].startswith('- '):
                items.append(lines[i][2:])
                i += 1
            out.append('<ul>')
            for item in items:
                out.append(f'<li>{_inline(item)}</li>')
            out.append('</ul>')
            continue

        if line.strip() == '':
            i += 1
            continue

        para_lines = []
        while i < len(lines) and lines[i].strip() != '' and not lines[i].startswith('#') and not lines[i].startswith('- ') and not lines[i].startswith('|'):
            if re.match(r'^-{3,}\s*$', lines[i]):
                break
            para_lines.append(lines[i])
            i += 1
        if para_lines:
            out.append(f'<p>{_inline(" ".join(para_lines))}</p>')

    return (
        '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '<title>README</title>\n'
        '<style>body{font-family:sans-serif;max-width:800px;margin:auto;padding:1rem}'
        'table{border-collapse:collapse;margin:1rem 0}'
        'th,td{border:1px solid #ccc;padding:.4rem .8rem}'
        'a{color:#0366d6}</style>\n'
        '</head>\n<body>\n'
        + '\n'.join(out)
        + '\n</body>\n</html>\n'
    )


def build_html(readme_path):
    out_path = ROOT / 'public' / 'readme.html'
    md_text = readme_path.read_text()
    out_path.write_text(markdown_to_html(md_text))
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

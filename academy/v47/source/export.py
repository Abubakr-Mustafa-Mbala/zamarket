import sys, os, json, csv, html
sys.path.insert(0, os.path.dirname(__file__))
from content import COURSE, MODULES

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

# Basic checks: unique ids, every image exists, no empty fields.
ids = [l['id'] for m in MODULES for l in m['lessons']]
assert len(ids) == len(set(ids)), 'duplicate lesson ids'
for m in MODULES:
    assert os.path.exists(os.path.join(OUT, m['cover'])), m['cover']
    for l in m['lessons']:
        assert os.path.exists(os.path.join(OUT, l['image'])), l['image']
        for k in ('title', 'learning_outcome', 'demonstration', 'practice'):
            assert l[k].strip(), (l['id'], k)
        assert l['teaching_notes'] and l['knowledge_check']['question'] and l['knowledge_check']['answer'], l['id']

json.dump(COURSE, open(f'{OUT}/course.json', 'w'), ensure_ascii=False, indent=1)

with open(f'{OUT}/lessons.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['module', 'lesson_id', 'lesson_title', 'outcome', 'teaching_notes', 'demonstration', 'practice', 'quiz_question', 'quiz_answer',
                'duration_minutes', 'key_points', 'facilitator_note', 'icon', 'image', 'module_title', 'module_cover'])
    for m in MODULES:
        for l in m['lessons']:
            w.writerow([m['number'], l['id'], l['title'], l['learning_outcome'], ' '.join(l['teaching_notes']), l['demonstration'], l['practice'],
                        l['knowledge_check']['question'], l['knowledge_check']['answer'], l['duration_minutes'], ' | '.join(l['key_points']),
                        l['facilitator_note'], l['icon'], l['image'], m['title'], m['cover']])

md = [f"# {COURSE['title']}", '', COURSE['subtitle'], '', f"> {COURSE['no_guarantee']}", '', '## Contents', '']
for m in MODULES:
    md.append(f"{m['number']}. {m['title']} ({len(m['lessons'])} lessons)")
md.append('')
for m in MODULES:
    md += [f"## Module {m['number']:02d}: {m['title']}", '', f"![Module {m['number']} cover]({m['cover']})", '', m['summary'], '']
    for l in m['lessons']:
        md += [f"### Lesson {l['id']}: {l['title']}", '', f"*About {l['duration_minutes']} minutes*", '', f"![]({l['image']})", '',
               f"**You will be able to:** {l['learning_outcome']}", '']
        if l['key_points']:
            md += ['**Key points**', ''] + [f"- {k}" for k in l['key_points']] + ['']
        md += ['**Lesson**', ''] + [f"- {n}" for n in l['teaching_notes']] + ['',
               f"**Show it:** {l['demonstration']}", '', f"**Your turn:** {l['practice']}", '',
               f"**Check:** {l['knowledge_check']['question']}", '', f"> {l['knowledge_check']['answer']}", '']
        if l['facilitator_note']:
            md += [f"*For the trainer:* {l['facilitator_note']}", '']
open(f'{OUT}/course.md', 'w').write('\n'.join(md))

# A readable, branded version of the whole course that opens on a phone.
e = html.escape
parts = []
for m in MODULES:
    lessons = []
    for l in m['lessons']:
        kp = ''.join(f'<li>{e(k)}</li>' for k in l['key_points'])
        lessons.append(f"""<details class="lesson"><summary><span class="lid">{e(l['id'])}</span><span class="lt">{e(l['title'])}</span><span class="lm">{l['duration_minutes']} min</span></summary>
<div class="body"><img src="{e(l['image'])}" alt="" loading="lazy"><p class="out"><b>You will be able to:</b> {e(l['learning_outcome'])}</p>
{f'<ul class="kp">{kp}</ul>' if kp else ''}<ul>{''.join(f'<li>{e(n)}</li>' for n in l['teaching_notes'])}</ul>
<div class="box"><b>Show it</b><p>{e(l['demonstration'])}</p></div><div class="box"><b>Your turn</b><p>{e(l['practice'])}</p></div>
<details class="quiz"><summary>Check: {e(l['knowledge_check']['question'])}</summary><p>{e(l['knowledge_check']['answer'])}</p></details>
{f'<p class="fac"><b>For the trainer:</b> {e(l["facilitator_note"])}</p>' if l['facilitator_note'] else ''}</div></details>""")
    parts.append(f"""<section class="mod" id="m{m['number']}"><img class="cover" src="{e(m['cover'])}" alt="Module {m['number']}: {e(m['title'])}"><p class="sum">{e(m['summary'])}</p>{''.join(lessons)}</section>""")
toc = ''.join(f'<a href="#m{m["number"]}"><b>{m["number"]:02d}</b>{e(m["title"])}</a>' for m in MODULES)
page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ZaMarket Academy</title>
<style>:root{{--bg:#0E1013;--panel:#15181C;--line:#272C33;--text:#EDEFF2;--muted:#8C949E;--accent:#8A6CFF;--accent-text:#A892FF}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--text);font-family:'Plus Jakarta Sans',system-ui,sans-serif;line-height:1.55}}
main{{max-width:900px;margin:0 auto;padding:24px 16px 60px}}h1{{font-size:clamp(1.8rem,5vw,2.6rem);letter-spacing:-.02em;margin:0 0 8px}}
.lead{{color:#C2C8D0}}.note{{border:1px solid var(--line);background:var(--panel);border-radius:14px;padding:12px 14px;color:#C2C8D0;font-size:.92rem}}
.toc{{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px;margin:20px 0 30px}}.toc a{{display:flex;gap:10px;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--text);text-decoration:none;font-weight:600;font-size:.92rem}}.toc b{{color:var(--accent-text)}}
.mod{{margin:36px 0}}.cover{{width:100%;border-radius:18px;display:block}}.sum{{color:#C2C8D0}}
.lesson{{border:1px solid var(--line);background:var(--panel);border-radius:14px;margin:10px 0;overflow:hidden}}.lesson>summary{{list-style:none;cursor:pointer;display:flex;gap:12px;align-items:center;padding:14px 16px}}
.lesson>summary::-webkit-details-marker{{display:none}}.lid{{color:var(--accent-text);font-weight:800;font-size:.85rem}}.lt{{font-weight:700;flex:1}}.lm{{color:var(--muted);font-size:.8rem;white-space:nowrap}}
.body{{padding:0 16px 16px}}.body img{{width:100%;border-radius:12px;margin:4px 0 10px}}.out{{margin:0 0 8px}}.kp{{background:#241E45;border-radius:12px;padding:10px 14px 10px 30px;color:#DCD3FF}}
.box{{border-left:3px solid var(--accent);padding:6px 12px;margin:10px 0;background:#1C2026;border-radius:0 10px 10px 0}}.box p{{margin:4px 0 0;color:#C2C8D0}}
.quiz{{border:1px dashed var(--line);border-radius:10px;padding:10px 12px;margin:10px 0}}.quiz summary{{cursor:pointer;font-weight:600}}.fac{{color:var(--muted);font-size:.88rem}}</style></head>
<body><main><p style="color:var(--accent-text);font-weight:800;letter-spacing:.14em;text-transform:uppercase;font-size:.78rem">ZaMarket Academy</p>
<h1>{e(COURSE['title'])}</h1><p class="lead">{e(COURSE['subtitle'])}</p><p class="note">{e(COURSE['no_guarantee'])} {e(COURSE['license_note'])}</p>
<nav class="toc">{toc}</nav>{''.join(parts)}</main></body></html>"""
open(f'{OUT}/course.html', 'w').write(page)

open(f'{OUT}/README.md', 'w').write(f"""# ZaMarket Academy — Affiliate Course (V47)

- {len(MODULES)} modules, {len(ids)} lessons, about {sum(l['duration_minutes'] for m in MODULES for l in m['lessons'])} minutes of teaching.
- Written from how ZaMarket works today: affiliate pages, your link and the 30-day credit, the poster maker, WhatsApp, ZaMarket Motors, lunch plans and getting paid.
- `course.json`: modules and lessons for import (same structure as V46, plus `icon`, `image`, `key_points` per lesson and `cover` per module).
- `lessons.csv`: one row per lesson. The first nine columns match V46; the new columns are added at the end.
- `course.md`: the whole course to read, with the pictures.
- `course.html`: the whole course as a branded page that opens on a phone (keep it next to the `images` folder).
- `images/`: {len(MODULES)} module covers and 12 diagrams, 1600x900 PNG, in ZaMarket's colours.

Before publishing: figures that can change (commission for each product, the payout minimum, lunch cut-off and delivery times) are deliberately not written as numbers. Learners are shown where to read them in their own account.

{COURSE['no_guarantee']}
""")
print('lessons', len(ids), 'minutes', sum(l['duration_minutes'] for m in MODULES for l in m['lessons']))

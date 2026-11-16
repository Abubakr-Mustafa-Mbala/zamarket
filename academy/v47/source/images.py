"""Draws the Academy's module covers and diagrams in ZaMarket's brand and
saves them as PNG (1600x900). Run: python3 images.py <outdir>"""
import sys, os, html
sys.path.insert(0, os.path.dirname(__file__))
from content import MODULES
from playwright.sync_api import sync_playwright

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
FONT = '/tmp/fontgrab/node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-{w}-normal.woff2'
LOGO = open('/home/claude/zamarket-repo/public/favicon.svg').read()

I = {  # 24x24 line icons
 'compass': '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
 'phone': '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
 'link': '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>',
 'camera': '<path d="M4 7.5h3l1.6-2.5h6.8L17 7.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/>',
 'target': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
 'whatsapp': '<path d="M4 20l1.2-3.8A8.5 8.5 0 1 1 8 19z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .8c-1-.4-2.3-1.7-2.7-2.7l.8-1-1-2z"/>',
 'megaphone': '<path d="M3 10.5v3l11 5V5.5z"/><path d="M14 9c2 0 4 1.3 4 3s-2 3-4 3M6 14.5 7.5 20h3l-1.5-5"/>',
 'pen': '<path d="M4 20l1-4.5L16 4.5l3.5 3.5-11 11z"/><path d="M13.5 7l3.5 3.5"/>',
 'chat': '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
 'car': '<path d="M3 15.5v-3l2-4.5a2 2 0 0 1 1.8-1.2h10.4a2 2 0 0 1 1.8 1.2l2 4.5v3z"/><circle cx="7.5" cy="16" r="2"/><circle cx="16.5" cy="16" r="2"/><path d="M5 12h14"/>',
 'bowl': '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-1.5 1-1.5 1-3M12 7c0-1.5 1-1.5 1-3M16 7c0-1.5 1-1.5 1-3"/>',
 'scale': '<path d="M12 3v18M5 21h14M4 7h16"/><path d="M4 7l-2.5 6a3 3 0 0 0 5 0zM20 7l-2.5 6a3 3 0 0 0 5 0z"/>',
 'chart': '<path d="M4 20V10M10 20V4M16 20v-7M2 20h20"/>',
 'rocket': '<path d="M12 2.5c3 2 5 5.5 5 9.5l-2.5 3.5h-5L7 12c0-4 2-7.5 5-9.5z"/><circle cx="12" cy="9.5" r="1.8"/><path d="M9.5 15.5 8 20l4-2 4 2-1.5-4.5"/>',
 'users': '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.7.8 2.7 2.6 3 5.2"/>',
 'coins': '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.6-2.4-2.9-5.5-3"/>',
 'store': '<path d="M3 9.5 4.5 4h15L21 9.5M3 9.5h18v1a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M5 13v7h14v-7"/>',
 'calendar': '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
 'repeat': '<path d="M4 11V9a3 3 0 0 1 3-3h12l-3-3M20 13v2a3 3 0 0 1-3 3H5l3 3"/>',
 'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
 'shield': '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="m9 12 2 2 4-4"/>',
 'image': '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9.5" r="1.8"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',
 'check': '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
 'star': '<path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/>',
 'wallet': '<path d="M4 7h15a1 1 0 0 1 1 1v11H5a1 1 0 0 1-1-1z"/><path d="M4 7l11-3v3M16 13h4"/>',
 'tag': '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8" r="1.5"/>',
 'building': '<path d="M5 21V4h10v17M15 9h4v12M3 21h18M8 8h4M8 12h4M8 16h4"/>',
 'flag': '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
 'home': '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
 'eye': '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
}
def icon(name, size=48, color='#A892FF', sw=1.8):
    return f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">{I.get(name, I["star"])}</svg>'

BASE = """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:J;src:url(%s) format('woff2');font-weight:400}
@font-face{font-family:J;src:url(%s) format('woff2');font-weight:600}
@font-face{font-family:J;src:url(%s) format('woff2');font-weight:800}
*{box-sizing:border-box;margin:0;padding:0}
body{width:1600px;height:900px;overflow:hidden;font-family:J,sans-serif;color:#EDEFF2;
 background:radial-gradient(900px 600px at 85%% 30%%,rgba(138,108,255,.30),transparent 70%%),radial-gradient(700px 500px at 0%% 100%%,rgba(148,50,244,.18),transparent 70%%),#0E1013}
.brand{position:absolute;left:72px;top:56px;display:flex;align-items:center;gap:16px;font-weight:800;font-size:26px;letter-spacing:-.01em}
.brand svg{width:56px;height:56px;border-radius:14px}
.brand small{display:block;font-weight:600;font-size:16px;color:#A892FF;letter-spacing:.14em;text-transform:uppercase}
.foot{position:absolute;left:72px;right:72px;bottom:44px;display:flex;justify-content:space-between;color:#8C949E;font-size:18px;font-weight:600}
.eyebrow{color:#A892FF;font-weight:800;letter-spacing:.18em;text-transform:uppercase;font-size:20px}
h1{font-size:68px;line-height:1.05;letter-spacing:-.03em;font-weight:800}
h2{font-size:52px;line-height:1.08;letter-spacing:-.025em;font-weight:800}
p.lead{font-size:26px;line-height:1.45;color:#C2C8D0}
.card{background:#15181C;border:1.5px solid #272C33;border-radius:24px}
.pill{display:inline-flex;align-items:center;gap:10px;padding:10px 18px;border-radius:999px;background:#241E45;color:#C9BDFF;font-weight:600;font-size:20px}
</style></head><body>%s</body></html>"""
import base64
def _f(w): return 'data:font/woff2;base64,' + base64.b64encode(open(FONT.format(w=w), 'rb').read()).decode()
F400, F600, F800 = _f(400), _f(600), _f(800)
def page(body):
    return BASE % (F400, F600, F800, body)

def brand(sub='Academy'):
    return f'<div class="brand">{LOGO}<div>ZaMarket<small>{sub}</small></div></div>'
def foot(left='zamarket.shop', right='ZaMarket Academy'):
    return f'<div class="foot"><span>{left}</span><span>{right}</span></div>'

def cover(m):
    t = html.escape(m['title']); s = html.escape(m['summary'])
    body = f"""{brand()}
<div style="position:absolute;left:72px;top:210px;width:900px;display:flex;flex-direction:column;gap:26px">
  <div class="eyebrow">Module {m['number']:02d}</div>
  <h1>{t}</h1>
  <p class="lead">{s}</p>
  <div><span class="pill">{icon('check', 24, '#C9BDFF', 2.2)} {len(m['lessons'])} lessons · about {sum(l['duration_minutes'] for l in m['lessons'])} minutes</span></div>
</div>
<div style="position:absolute;right:120px;top:190px;width:440px;height:440px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#2A2250,#15181C 70%);border:2px solid #3A3070;display:grid;place-items:center;box-shadow:0 40px 120px rgba(138,108,255,.25)">
  {icon(m['icon'], 230, '#B9A6FF', 1.4)}
</div>
<div style="position:absolute;right:120px;top:150px;width:96px;height:96px;border-radius:50%;background:#8A6CFF;display:grid;place-items:center;font-weight:800;font-size:40px;color:#0E1013">{m['number']}</div>
{foot()}"""
    return page(body)

def steps(title, sub, items, cols=None):
    cols = cols or len(items)
    cards = ''.join(f"""<div class="card" style="padding:36px 30px 40px;display:flex;flex-direction:column;gap:18px;min-height:330px;position:relative">
      <div style="display:flex;align-items:center;gap:14px"><span style="width:46px;height:46px;border-radius:50%;background:#8A6CFF;color:#0E1013;display:grid;place-items:center;font-weight:800;font-size:22px">{i+1}</span>{icon(ic, 46)}</div>
      <div style="font-weight:800;font-size:31px;line-height:1.15">{html.escape(h)}</div>
      <div style="color:#C2C8D0;font-size:23px;line-height:1.45">{html.escape(d)}</div></div>""" for i, (ic, h, d) in enumerate(items))
    return page(f"""{brand()}
<div style="position:absolute;left:72px;right:72px;top:150px;display:flex;flex-direction:column;gap:14px">
  <h2>{html.escape(title)}</h2><p class="lead" style="font-size:24px">{html.escape(sub)}</p></div>
<div style="position:absolute;left:72px;right:72px;top:350px;display:grid;grid-template-columns:repeat({cols},1fr);gap:22px">{cards}</div>
{foot()}""")

DIAGRAMS = {
 'diagram-how-you-earn': lambda: steps('How you earn on ZaMarket', 'You bring the buyer. ZaMarket does the rest. You earn when the order is complete.', [
   ('link', 'You share your link', 'A poster, a post or a message with your own link or QR code.'),
   ('users', 'A buyer orders', 'Within 30 days, through your link. The last link they used gets the credit.'),
   ('shield', 'ZaMarket delivers', 'Calls to confirm, delivers with its riders, collects the payment.'),
   ('coins', 'You get paid', 'Pending until complete and checked, then ready. Ask to be paid by mobile money.')]),
 'diagram-dashboard-tour': lambda: steps('Your affiliate pages', 'Everything you need is in the menu and the bottom bar.', [
   ('home', 'Home', 'Your goal, earnings and what is pending.'),
   ('store', 'Promote products', 'Every product, its price, your commission and your link.'),
   ('car', 'Vehicles', 'Cars, estimated rewards, Register a buyer, My buyers.'),
   ('wallet', 'My earnings', 'Ready, requested and paid. Ask to be paid.')]),
 'diagram-poster-designs': lambda: steps('Making a poster in four taps', 'Real photos, real price, your link in the QR code. Nothing invented.', [
   ('image', 'Choose the photo', 'The clearest, brightest photo of the actual item.'),
   ('star', 'Choose the design', 'Full-bleed hero, Several angles, Clean Catalogue, Editorial Split.'),
   ('tag', 'Posting to', 'Status, chat, Facebook, Instagram, TikTok or print. Your link is tagged.'),
   ('megaphone', 'Share', 'Poster and caption together. Or download and copy the caption.')]),
 'diagram-vehicle-deal': lambda: steps('How a vehicle deal works', 'ZaMarket connects buyers with owners and dealers. We do not sell the vehicle.', [
   ('chat', 'Enquiry', 'Through your link, on WhatsApp, or you register the buyer.'),
   ('users', 'We connect', 'ZaMarket records it and passes it to the owner or dealer.'),
   ('eye', 'Viewing', 'We help arrange it. The buyer inspects and checks the papers.'),
   ('check', 'Deal closes', 'Price agreed with the seller. Buyer pays only after seeing it.'),
   ('coins', 'You earn', 'The estimate becomes final on the agreed price, paid after closing.')], 5),
 'diagram-link-credit': lambda: steps('Your link and your credit', 'Use your own link every time, so every buyer you bring counts.', [
   ('link', 'Your link', 'zamarket.shop/r/your-code/product. Plain /p/ links do not credit you.'),
   ('clock', '30 days', 'Remembered on the buyer\'s phone for 30 days.'),
   ('repeat', 'Last link wins', 'If they tap another affiliate\'s link later, credit moves.'),
   ('phone', 'Called you?', 'Register vehicle buyers. Send your link for everything else.')]),
 'diagram-warm-market': lambda: steps('Who to talk to first', 'Your first buyers already know you. Start close, then go wider.', [
   ('users', 'Inner circle', 'Family and close friends. Birthdays, events, family cars.'),
   ('building', 'Work and community', 'Colleagues, church or mosque, school parents. Office lunch, cakes.'),
   ('store', 'Businesses you know', 'Restaurants, shops, contractors. Equipment and pickups.'),
   ('megaphone', 'New people', 'Groups and social media, once your posts are working.')]),
 'diagram-calendar': lambda: steps('When people buy', 'Plan posts around real buying moments.', [
   ('wallet', 'Month-end', 'Salaries arrive. Your best products in the last and first week.'),
   ('star', 'Birthdays', 'Every week. Ask your circle who is celebrating.'),
   ('calendar', 'Seasons', 'Back to school, Valentine\'s, Mother\'s Day, 24 October, Eid, Christmas.'),
   ('building', 'Monday mornings', 'Offices plan the week. A good time for lunch plans.')]),
 'diagram-lunch-earnings': lambda: steps('Lunch plans pay you again and again', 'You earn on every lunch delivered to customers you brought.', [
   ('bowl', 'Try one lunch', 'The easy first step for a new customer.'),
   ('calendar', 'Pick the days', 'They tap the days, choose dishes and see the total.'),
   ('repeat', 'They book again', 'Remind them on Friday. You earn on every re-booking.'),
   ('building', 'Their team joins', 'One happy customer brings the office.')]),
 'diagram-whatsapp-rhythm': lambda: steps('A day on WhatsApp status', '3 to 5 posts, spread out. Product, useful, personal.', [
   ('clock', '07:30', 'Lunch plan: order by the cut-off for tomorrow.'),
   ('image', '12:30', 'A cake or product poster in story size.'),
   ('car', '18:00', 'A vehicle: photo set or short video.'),
   ('users', '20:00', 'Something personal or useful. Not every post sells.')]),
 'diagram-follow-up': lambda: steps('The 1-3-7 follow-up', 'Most sales happen after the first message. Then stop.', [
   ('chat', 'Day 1', '"Did you get a chance to look?"'),
   ('image', 'Day 3', 'Something useful: a new photo, an answer to a question.'),
   ('flag', 'Day 7', 'A last friendly note. Then stop and respect their choice.')], 3),
 'diagram-funnel': lambda: steps('Your four numbers', 'Write them every week. Fix the weakest step.', [
   ('eye', 'Reached', 'Status views, post reach.'),
   ('chat', 'Conversations', 'People who asked something.'),
   ('check', 'Orders', 'From Commissions and My earnings.'),
   ('coins', 'Commission', 'Pending and ready.')]),
 'diagram-30-days': lambda: steps('Your first 30 days', 'One focus each week. Keep the daily status rhythm throughout.', [
   ('users', 'Week 1', 'Set up. Five products. Five personal messages a day.'),
   ('megaphone', 'Week 2', 'Groups and one social platform. Follow up 1-3-7.'),
   ('car', 'Week 3', 'Vehicles and lunch plans. Offices and car contacts.'),
   ('chart', 'Week 4', 'Review your numbers. Do more of what worked.')]),
}

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1600, 'height': 900})
    for m in MODULES:
        pg.set_content(cover(m)); pg.wait_for_timeout(150)
        pg.screenshot(path=f"{OUT}/module-{m["number"]:02d}.jpg")
    for name, fn in DIAGRAMS.items():
        pg.set_content(fn()); pg.wait_for_timeout(150)
        pg.screenshot(path=f"{OUT}/{name}.jpg")
    b.close()
print('done', len(os.listdir(OUT)))

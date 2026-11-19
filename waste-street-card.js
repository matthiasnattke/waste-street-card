/* Waste Street Card – waste collection calendar as a street scene: bins that are due stand at the kerb.
   Works with any calendar entity (e.g. Waste Collection Schedule, ICS, local calendar).
   MIT License – see LICENSE */
const WST_VERSION = '1.0.2';
const WST_LANG = (h) => { const l = ((h && ((h.locale && h.locale.language) || h.language)) || 'en').slice(0, 2); return l === 'de' ? 'de' : 'en'; };
const WST_I18N = {
  en: { title: 'Waste collection', bins: { bio: 'Organic', paper: 'Paper', recycling: 'Recycling', residual: 'General waste' }, none: 'no date', today: 'today', tomorrow: 'tomorrow', inDays: (n) => `in ${n} days`, loading: 'Loading waste calendar …', pickupToday: 'Collection today:', alsoTomorrow: 'tomorrow:', putOut: 'Put out today:', pickupTomorrow: '(collection tomorrow)', next: 'Next collection:', nothing: 'No dates in the calendar', and: ' and ' },
  de: { title: 'Abfallplan', bins: { bio: 'Bio', paper: 'Papier', recycling: 'Gelbe Tonne', residual: 'Restmüll' }, none: 'kein Termin', today: 'heute', tomorrow: 'morgen', inDays: (n) => `in ${n} Tagen`, loading: 'Lade Abfallkalender …', pickupToday: 'Heute Abholung:', alsoTomorrow: 'morgen:', putOut: 'Heute rausstellen:', pickupTomorrow: '(Abholung morgen)', next: 'Nächste Abholung:', nothing: 'Keine Termine im Kalender', and: ' und ' },
};
// `match` is a case-insensitive regular expression tested against the event title.
const WST_TYPES = [
  { key: 'bio', match: 'bio|organic|compost|garden', body: '#7a4a21', lid: '#5a3413' },
  { key: 'paper', match: 'papier|paper|pappe|cardboard', body: '#2f6fd0', lid: '#1f56ad' },
  { key: 'recycling', match: 'gelb|wertstoff|verpackung|recycl|packaging|plastic', body: '#f2c500', lid: '#d4a900' },
  { key: 'residual', match: 'rest|general|residual|landfill|refuse', body: '#4a4f56', lid: '#1f2226' },
];
class WasteStreetCard extends HTMLElement {
  static getStubConfig() { return { entity: '' }; }
  setConfig(c) {
    if (!c || !c.entity) throw new Error('entity (calendar) is required');
    this._c = c; this._ev = null; this._last = 0; this._state = null;
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
  }
  getCardSize() { return 4; }
  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 9 }; }

  set hass(h) {
    this._hass = h;
    const st = h.states[this._c.entity], s = st ? st.state + (st.attributes.start_time || '') : 'x';
    if (Date.now() - this._last > 1800000 || s !== this._state) { this._state = s; this._last = Date.now(); this._load(); }
    if (!this._drawn || this._lang !== WST_LANG(h)) this._render();
  }

  async _load() {
    try {
      const a = new Date(); a.setHours(0, 0, 0, 0);
      const b = new Date(a.getTime() + (this._c.days || 60) * 864e5);
      this._ev = await this._hass.callApi('GET', `calendars/${encodeURIComponent(this._c.entity)}?start=${encodeURIComponent(a.toISOString())}&end=${encodeURIComponent(b.toISOString())}`);
    } catch (e) { console.warn('waste-street-card', e); this._ev = this._ev || []; }
    this._render();
  }

  _render() {
    if (!this.shadowRoot || !this._hass) return;
    this._drawn = true; this._lang = WST_LANG(this._hass);
    const c = this._c, T = WST_I18N[this._lang], loc = (this._hass.locale && this._hass.locale.language) || this._hass.language || 'en';
    const re = (m) => { try { return new RegExp(m, 'i'); } catch (e) { return new RegExp(String(m).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); } };
    const types = (c.types || WST_TYPES).map((t) => ({ ...t, label: t.label || T.bins[t.key] || t.key || t.match }))
      .filter((t) => !(c.exclude || []).some((x) => re(x).test((t.key || '') + ' ' + t.label + ' ' + t.match)));
    const now = new Date(), day0 = new Date(now); day0.setHours(0, 0, 0, 0);
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
    const when = (e) => new Date(e.start.dateTime || e.start.date + 'T00:00:00');
    const until = (e) => (e.end ? new Date(e.end.dateTime || e.end.date + 'T00:00:00') : new Date(when(e).getTime() + 864e5));
    const evs = (this._ev || []).filter((e) => e.start && until(e) > now).sort((p, q) => when(p) - when(q));
    // Bins sorted by their next collection: the next one stands on the left.
    const bins = types.map((t) => {
      const e = evs.find((x) => re(t.match).test(x.summary || ''));
      if (!e) return { t, d: null };
      const w = when(e), wd = new Date(w); wd.setHours(0, 0, 0, 0);
      return { t, d: Math.round((wd - day0) / 864e5), w };
    }).sort((p, q) => (p.d == null ? 1e9 : p.d) - (q.d == null ? 1e9 : q.d));
    const fmt = (w) => w.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'numeric' });
    const rel = (b) => (b.d == null ? T.none : b.d === 0 ? T.today : b.d === 1 ? T.tomorrow : b.d < 7 ? T.inDays(b.d) : fmt(b.w));
    const out = bins.filter((b) => b.d === 0 || b.d === 1), today = out.filter((b) => b.d === 0), tomorrow = out.filter((b) => b.d === 1);
    const names = (a) => a.map((b) => b.t.label).join(T.and);
    let head;
    if (!this._ev) head = T.loading;
    else if (today.length) head = `<b>${T.pickupToday}</b> ${esc(names(today))}${tomorrow.length ? ` · ${T.alsoTomorrow} ${esc(names(tomorrow))}` : ''}`;
    else if (tomorrow.length) head = `<b>${T.putOut}</b> ${esc(names(tomorrow))} ${T.pickupTomorrow}`;
    else { const nx = bins.find((b) => b.d != null); head = nx ? `${T.next} <b>${esc(nx.t.label)}</b>, ${rel(nx)} (${fmt(nx.w)})` : T.nothing; }
    const n = Math.max(1, bins.length), W = 400;
    const bin = (t) => `<polygon points="-11,-34 11,-34 9,0 -9,0" fill="${esc(t.body)}"/><line x1="-8" y1="-26" x2="8" y2="-26" stroke="rgba(255,255,255,.18)" stroke-width="1.5"/><rect x="-13" y="-40" width="26" height="7" rx="2.5" fill="${esc(t.lid)}"/><rect x="10" y="-38" width="6" height="3" rx="1" fill="${esc(t.lid)}"/><circle cx="7" cy="-1" r="4.2" fill="#15171a"/><circle cx="7" cy="-1" r="1.4" fill="#8a8f96"/>`;
    let s = '';
    for (let x = 6; x < W; x += 16) s += `<path d="M${x},92V62l4,-5l4,5V92Z" class="fe"/>`;
    s += '<line x1="0" y1="70" x2="400" y2="70" class="ra"/><line x1="0" y1="84" x2="400" y2="84" class="ra"/>';
    s += '<rect x="0" y="94" width="400" height="66" class="sw"/><rect x="0" y="160" width="400" height="52" class="st"/><line x1="0" y1="160" x2="400" y2="160" class="cu"/><line x1="0" y1="200" x2="400" y2="200" class="ml"/>';
    bins.forEach((b, i) => {
      const x = W * (i + 0.5) / n, isOut = b.d === 0 || b.d === 1;
      if (isOut) s += `<g transform="translate(${x},157)"><g class="out" style="animation-delay:${i * 0.25}s">${bin(b.t)}</g></g>`;
      else s += `<g transform="translate(${x},96) scale(.8)" opacity="${b.d == null ? 0.35 : 1}">${bin(b.t)}</g>`;
      const y = isOut ? 176 : 112;
      s += `<text x="${x}" y="${y}" text-anchor="middle" class="la${isOut ? ' hi' : ''}">${esc(b.t.label)}</text><text x="${x}" y="${y + 12}" text-anchor="middle" class="lb${isOut ? ' hi' : ''}">${rel(b)}</text>`;
    });
    if (today.length) s += '<g class="tr"><rect x="0" y="-22" width="34" height="20" rx="2" fill="#e8772e"/><rect x="34" y="-16" width="14" height="14" rx="2" fill="#d9d9d9"/><rect x="37" y="-13" width="8" height="6" fill="#6fb7e8"/><circle cx="9" cy="0" r="4.5" fill="#15171a"/><circle cx="38" cy="0" r="4.5" fill="#15171a"/></g>';
    this.shadowRoot.innerHTML = `<style>
ha-card{padding:12px 12px 8px;overflow:hidden;cursor:pointer}
.ti{font-size:20px;padding:2px 4px 6px}
.hd{font-size:14px;padding:0 4px 8px}
.hd b{color:var(--primary-color,#03a9f4)}
svg{display:block;width:100%;height:auto}
.fe{fill:var(--secondary-background-color,#e6e6e6);stroke:var(--divider-color,#bdbdbd);stroke-width:1}
.ra{stroke:var(--divider-color,#bdbdbd);stroke-width:3}
.sw{fill:rgba(128,128,128,.10)}.st{fill:rgba(70,74,80,.45)}
.cu{stroke:rgba(128,128,128,.7);stroke-width:2}.ml{stroke:rgba(255,255,255,.75);stroke-width:2;stroke-dasharray:14 12}
.la{font-size:10px;font-weight:600;fill:var(--primary-text-color,#222)}
.lb{font-size:9.5px;fill:var(--secondary-text-color,#666)}
.lb.hi{fill:var(--primary-text-color,#222);font-weight:700}
.out{animation:roll 1.4s ease-out both}
@keyframes roll{from{transform:translate(0,-61px) scale(.8)}to{transform:translate(0,0) scale(1)}}
.tr{animation:drive 14s linear infinite}
@keyframes drive{from{transform:translate(-60px,207px)}to{transform:translate(420px,207px)}}
</style><ha-card>${c.title === '' ? '' : `<div class="ti">${esc(c.title != null ? c.title : T.title)}</div>`}<div class="hd">${head}</div><svg viewBox="0 50 400 162">${s}</svg></ha-card>`;
    this.shadowRoot.querySelector('ha-card').addEventListener('click', () => this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: c.entity }, bubbles: true, composed: true })));
  }
}
if (!customElements.get('waste-street-card')) customElements.define('waste-street-card', WasteStreetCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === 'waste-street-card')) window.customCards.push({ type: 'waste-street-card', name: 'Waste Street Card', description: 'Waste collection calendar as a street scene' });
console.info(`%c WASTE-STREET-CARD %c ${WST_VERSION} `, 'color:#fff;background:#2f6fd0;font-weight:700', 'color:#2f6fd0;background:#fff');

/*
 * Sweet Home dashboard: shows up under "Community dashboards" in Settings → Dashboards → Add dashboard.
 * It makes one full-screen (panel) view with the Sweet Home card. Any options given to the strategy are passed to the
 * card, e.g. strategy: { type: custom:sweet-home, title: Our Flat, house: {...} }. "Take control" turns it into a normal
 * dashboard whose card can then be edited in the visual editor.
 */
const TYPE = 'sweet-home';
const REPO = 'https://github.com/mousawm/sweet-home';

class SweetHomeDashboardStrategy extends HTMLElement {
  static async generate(config = {}) {
    const { type, ...card } = config;
    return {
      title: card.title || 'Sweet Home',
      views: [{ title: 'Home', path: 'home', icon: 'mdi:home-heart', type: 'panel', cards: [{ type: 'custom:sweet-home-card', ...card }] }],
    };
  }
}

// small preview for the "Add dashboard" dialog: a house with a 3D floor plan and a tab bar
const thumb = (bg, fg, line) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160" fill="none">
<rect width="160" height="160" rx="8" fill="${bg}"/><rect x=".5" y=".5" width="159" height="159" rx="7.5" stroke="${line}"/>
<rect x="8" y="8" width="56" height="12" rx="6" fill="${fg}" fill-opacity=".35"/><circle cx="146" cy="14" r="6" fill="#2dd4bf"/>
<rect x="8" y="28" width="144" height="10" rx="5" fill="${fg}" fill-opacity=".14"/><rect x="10" y="30" width="26" height="6" rx="3" fill="#2dd4bf"/>
<path d="M80 50 140 80 80 110 20 80Z" fill="${fg}" fill-opacity=".1" stroke="${fg}" stroke-opacity=".45" stroke-width="2"/>
<path d="M20 80v10l60 30v-10Z" fill="${fg}" fill-opacity=".25"/><path d="M140 80v10l-60 30v-10Z" fill="${fg}" fill-opacity=".4"/>
<path d="M80 50 80 80 50 95M80 80 110 95M80 80 110 65" stroke="${fg}" stroke-opacity=".45" stroke-width="2"/>
<path d="M50 80 64 73 78 80 64 87Z" fill="#fbbf24" fill-opacity=".8"/><path d="M90 86 104 79 118 86 104 93Z" fill="#60a5fa" fill-opacity=".8"/>
<circle cx="64" cy="66" r="9" fill="#fde68a" fill-opacity=".35"/>
<rect x="8" y="128" width="44" height="24" rx="6" fill="${fg}" fill-opacity=".14"/><rect x="58" y="128" width="44" height="24" rx="6" fill="${fg}" fill-opacity=".14"/><rect x="108" y="128" width="44" height="24" rx="6" fill="${fg}" fill-opacity=".14"/>
<rect x="14" y="134" width="18" height="4" rx="2" fill="#2dd4bf"/><rect x="64" y="134" width="18" height="4" rx="2" fill="#fbbf24"/><rect x="114" y="134" width="18" height="4" rx="2" fill="#60a5fa"/>
</svg>`);

if (!customElements.get(`ll-strategy-dashboard-${TYPE}`)) customElements.define(`ll-strategy-dashboard-${TYPE}`, SweetHomeDashboardStrategy);
window.customStrategies = window.customStrategies || [];
if (!window.customStrategies.some(s => s.type === TYPE)) {
  window.customStrategies.push({
    type: TYPE, strategyType: 'dashboard', name: 'Sweet Home',
    description: 'Your home as an interactive 3D model, with tabs for security, climate, energy, media and more. Built from your areas.',
    documentationURL: REPO,
    images: { light: thumb('#ffffff', '#000000', 'rgba(0,0,0,.12)'), dark: thumb('#1c1c1c', '#ffffff', 'rgba(255,255,255,.24)') },
  });
}

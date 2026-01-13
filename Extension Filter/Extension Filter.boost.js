// ==UserScript==
// @name         Arc 插件页筛选（原生样式）
// @namespace    https://github.com/0-V-linuxdo/Arc-Boost
// @version      [20260113] v1.0.0
// @description  Add native-like filter (All/Enabled/Disabled) to Arc extensions page.
// @match        arc://extensions/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'enabled', label: 'Enabled' },
    { id: 'disabled', label: 'Disabled' },
  ];

  const STORAGE_KEY = 'arc-boost-extension-filter';
  const HIDDEN_ATTR = 'data-arc-filter-hidden';
  const STYLE_ID = 'arc-boost-filter-style';
  const BAR_ID = 'arc-boost-filter-bar';

  const state = {
    filter: 'all',
    shadowRoot: null,
    buttons: new Map(),
    countEl: null,
    rafId: 0,
  };

  function loadFilter() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      if (FILTERS.some((f) => f.id === value)) {
        return value;
      }
    } catch (err) {
      // Ignore storage errors on restricted pages.
    }
    return null;
  }

  function saveFilter(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (err) {
      // Ignore storage errors on restricted pages.
    }
  }

  function findInShadow(root, selector) {
    const direct = root.querySelector(selector);
    if (direct) return direct;

    const all = root.querySelectorAll('*');
    for (const node of all) {
      if (!node.shadowRoot) continue;
      const found = findInShadow(node.shadowRoot, selector);
      if (found) return found;
    }
    return null;
  }

  function findItemList() {
    const direct = document.querySelector('extensions-item-list');
    if (direct) return direct;

    const manager = document.querySelector('extensions-manager');
    if (manager && manager.shadowRoot) {
      return findInShadow(manager.shadowRoot, 'extensions-item-list');
    }

    return null;
  }

  function getItemState(item) {
    const root = item.shadowRoot;
    if (!root) return null;

    const card = root.querySelector('#card');
    if (card) {
      if (card.classList.contains('enabled')) return 'enabled';
      if (card.classList.contains('disabled')) return 'disabled';
    }

    const toggle = root.querySelector('cr-toggle#enableToggle');
    if (!toggle) return null;

    const pressed = toggle.getAttribute('aria-pressed');
    if (pressed === 'true') return 'enabled';
    if (pressed === 'false') return 'disabled';

    if (typeof toggle.checked === 'boolean') {
      return toggle.checked ? 'enabled' : 'disabled';
    }

    if (toggle.hasAttribute('checked')) return 'enabled';
    return null;
  }

  function updateButtons() {
    for (const [id, button] of state.buttons.entries()) {
      const active = id === state.filter;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  function updateCounts(shown, total, enabled, disabled) {
    if (!state.countEl) return;
    state.countEl.textContent =
      `Shown ${shown} / ${total} (On ${enabled}, Off ${disabled})`;
  }

  function applyFilter() {
    if (!state.shadowRoot) return;

    const items = Array.from(state.shadowRoot.querySelectorAll('extensions-item'));
    let total = 0;
    let shown = 0;
    let enabled = 0;
    let disabled = 0;

    for (const item of items) {
      const status = getItemState(item);
      total += 1;

      if (status === 'enabled') enabled += 1;
      if (status === 'disabled') disabled += 1;

      let visible = true;
      if (state.filter === 'enabled') visible = status === 'enabled';
      if (state.filter === 'disabled') visible = status === 'disabled';

      if (visible || status === null) {
        item.removeAttribute(HIDDEN_ATTR);
        shown += 1;
      } else {
        item.setAttribute(HIDDEN_ATTR, 'true');
      }
    }

    updateCounts(shown, total, enabled, disabled);
  }

  function scheduleApply() {
    if (state.rafId) return;
    state.rafId = requestAnimationFrame(() => {
      state.rafId = 0;
      applyFilter();
    });
  }

  function ensureStyles(shadowRoot) {
    if (shadowRoot.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;

    // 调整点：
    // 1) 选中态背景更“实”一点（更接近原生 WebUI 的 outline/segmented pressed tint）
    // 2) Filter label 复用原生 section header 的排版/字号（更像截图里的 Safety Check）
    style.textContent = `
#${BAR_ID} {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 12px 0 16px;
  color-scheme: light dark;
}

#${BAR_ID} .arc-boost-label {
  display: inline-flex;
  align-items: center;
  height: 32px;
  margin: 0;
  padding: 0 2px 0 0;
}

#${BAR_ID} .arc-boost-button {
  -webkit-appearance: none;
  appearance: none;
  font: inherit;

  height: 32px;
  padding: 0 16px;

  border-radius: 999px;
  border: 1px solid var(--cr-link-color, #1a73e8);

  background: transparent;
  color: var(--cr-link-color, #1a73e8);

  font-size: 13px;
  line-height: 20px;
  font-weight: 500;

  cursor: pointer;
  user-select: none;

  transition: background-color 120ms ease, box-shadow 120ms ease;
}

/* hover：比选中态略浅，接近原生 outline pill 的 hover tint */
#${BAR_ID} .arc-boost-button:hover {
  background: var(
    --cr-hover-background-color,
    color-mix(in srgb, currentColor 6%, transparent)
  );
}

/* active：略深一点点 */
#${BAR_ID} .arc-boost-button:active {
  background: var(
    --cr-active-background-color,
    color-mix(in srgb, currentColor 12%, transparent)
  );
}

/* pressed：选中态更接近原生的 tint（比 hover 更明显） */
#${BAR_ID} .arc-boost-button[aria-pressed="true"] {
  background: color-mix(in srgb, currentColor 14%, transparent);
  font-weight: 600;
}

/* pressed + active：按下时再深一点，保留原生的反馈感 */
#${BAR_ID} .arc-boost-button[aria-pressed="true"]:active {
  background: color-mix(in srgb, currentColor 18%, transparent);
}

#${BAR_ID} .arc-boost-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--cr-focus-outline-color, var(--cr-link-color, #1a73e8));
}

#${BAR_ID} .arc-boost-count {
  margin-left: auto;
  font-size: 13px;
  line-height: 20px;
  color: var(--cr-secondary-text-color, #5f6368);
  white-space: nowrap;
}

extensions-item[${HIDDEN_ATTR}="true"] {
  display: none !important;
}

@media (prefers-color-scheme: dark) {
  #${BAR_ID} .arc-boost-button {
    border-color: #2f7db8;
  }
}

@media (prefers-reduced-motion: reduce) {
  #${BAR_ID} .arc-boost-button {
    transition: none;
  }
}
    `.trim();

    shadowRoot.appendChild(style);
  }

  function createFilterBar(shadowRoot) {
    if (shadowRoot.getElementById(BAR_ID)) return;

    const section = shadowRoot.querySelector('#extensions-section');
    if (!section) return;

    const bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.className = 'items-container';

    const label = document.createElement('h2');
    label.className = 'section-header arc-boost-label';
    label.textContent = 'Filter';
    bar.appendChild(label);

    for (const filter of FILTERS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'arc-boost-button';
      button.dataset.filter = filter.id;
      button.textContent = filter.label;
      button.addEventListener('click', () => {
        state.filter = filter.id;
        saveFilter(state.filter);
        updateButtons();
        applyFilter();
      });

      state.buttons.set(filter.id, button);
      bar.appendChild(button);
    }

    const count = document.createElement('span');
    count.className = 'arc-boost-count';
    bar.appendChild(count);
    state.countEl = count;

    const header = section.querySelector('.section-header');
    section.insertBefore(bar, header || section.firstChild);
  }

  function attachListeners(shadowRoot) {
    shadowRoot.addEventListener('click', (event) => {
      const path = event.composedPath();
      const hitToggle = path.some((node) => {
        return node && node.id === 'enableToggle';
      });
      if (hitToggle) {
        scheduleApply();
      }
    });

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          scheduleApply();
          break;
        }
      }
    });

    observer.observe(shadowRoot, { childList: true, subtree: true });
  }

  function init(list) {
    if (!list.shadowRoot) return;
    if (list.shadowRoot.getElementById(BAR_ID)) return;

    state.shadowRoot = list.shadowRoot;

    ensureStyles(state.shadowRoot);
    createFilterBar(state.shadowRoot);

    const saved = loadFilter();
    if (saved) state.filter = saved;

    updateButtons();
    applyFilter();
    attachListeners(state.shadowRoot);
  }

  function waitForList() {
    const list = findItemList();
    if (list && list.shadowRoot) {
      init(list);
      return;
    }
    requestAnimationFrame(waitForList);
  }

  waitForList();
})();

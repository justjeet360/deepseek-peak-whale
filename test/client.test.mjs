import test from 'node:test';
import assert from 'node:assert/strict';

const RealDate = Date;
let fixed = new RealDate('2026-11-19T18:32:00Z');
globalThis.Date = class extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(fixed.getTime());
    else super(...args);
  }
  static now() { return fixed.getTime(); }
};

const EN = {
  peak: 'DeepSeek peak pricing',
  offPeak: 'DeepSeek off-peak pricing (50% cheaper)',
  peakEnds: 'Peak ends in',
  offPeakEnds: 'Off-peak ends in',
  credit: 'Credit:',
  creditChecking: 'Credit: checking...',
  creditUnavailable: 'Credit: unavailable',
  bonus: 'bonus',
};

let creditPreset;
let stateCall = 0;
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (init) => {
    stateCall += 1;
    if (stateCall === 4) return [creditPreset, () => {}];
    return [typeof init === 'function' ? init() : init, () => {}];
  },
  useEffect: () => {},
};

let loadBalance;
let registered;
let accountChange;
let balanceReads = 0;
const accountState = { view: { status: 'credential-stored' }, failed: false };
const ctx = {
  locale: {
    register: () => () => {},
    getSnapshot: () => ({ active: 'en' }),
  },
  effect: (fn) => { fn(); return () => {}; },
  on: (name, callback) => {
    if (name === 'account-ui/change') accountChange = callback;
    return () => {};
  },
  accountUi: {
    getSnapshot: () => accountState,
    clientMetadata: (locale) => ({ version: 'test', locale, timezoneOffsetSeconds: 0 }),
  },
  remote: {
    account: {
      getBalance: async () => {
        balanceReads += 1;
        return {
          ok: true,
          value: {
            status: 'ready',
            value: [{ currency: 'CNY', balance: '12.34' }],
            bonusWallets: [{ currency: 'CNY', balance: '2.00' }],
          },
        };
      },
    },
  },
  slots: {
    inject: (_name, callback) => callback(),
    register: (options, component) => { registered = { options, component }; },
  },
};

globalThis.window = {
  __ModuleLoader__: {
    load({ id, factory }) {
      assert.equal(id, 'deepseek-peak-whale');
      const require = (name) => {
        if (name === 'react') return React;
        if (name === '@deepseek-ai/dsh-client-ui-primitives') {
          return { FishLogo: 'FishLogo', Tooltip: 'Tooltip' };
        }
        throw new Error('unexpected require ' + name);
      };
      const module = factory(require);
      module.apply(ctx);
      loadBalance = registered.options.inject().loadBalance;
      globalThis.PeakWhale = registered.component;
    },
  },
  setInterval: () => 1,
  clearInterval: () => {},
};

await import(new URL('../client.js', import.meta.url).href);

function labelAt(iso, credit) {
  fixed = new RealDate(iso);
  creditPreset = credit;
  stateCall = 0;
  const tree = globalThis.PeakWhale({ size: 24, loadBalance, t: (key) => EN[key] });
  assert.equal(tree.type, 'Tooltip');
  return tree.props.label();
}

test('tooltip reports the countdown and rate', () => {
  assert.match(labelAt('2026-11-19T18:32:00Z'), /DeepSeek off-peak pricing/);
  assert.match(labelAt('2026-11-19T18:32:00Z'), /Off-peak ends in 6h 28m/);
  assert.match(labelAt('2026-11-19T03:00:00Z'), /DeepSeek peak pricing/);
  assert.match(labelAt('2026-11-19T03:00:00Z'), /Peak ends in 1h 0m/);
});

test('tooltip formats account and API-key wallets', () => {
  assert.match(labelAt('2026-11-19T18:32:00Z', {
    kind: 'ready',
    wallets: [{ currency: 'CNY', balance: '12.34' }],
    bonusWallets: [{ currency: 'CNY', balance: '2.00' }],
  }), /Credit: ¥12\.34 \+ ¥2\.00 bonus/);
  assert.match(labelAt('2026-11-19T18:32:00Z', { kind: 'ready', wallets: [{ currency: 'USD', balance: '1.95' }], bonusWallets: [] }), /Credit: \$1\.95/);
  assert.match(labelAt('2026-11-19T18:32:00Z', { kind: 'signed-out' }), /Credit: unavailable/);
});

test('balance reads are cached and invalidated on account reset', async () => {
  const first = await loadBalance();
  assert.equal(first.kind, 'ready');
  assert.equal(balanceReads, 1);
  await loadBalance();
  assert.equal(balanceReads, 1);
  accountChange({}, true);
  await loadBalance();
  assert.equal(balanceReads, 2);
});

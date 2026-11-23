window.__ModuleLoader__.load({
  id: 'deepseek-peak-whale',
  factory(require) {
    const React = require('react');
    const { FishLogo, Tooltip } = require('@deepseek-ai/dsh-client-ui-primitives');
    const h = React.createElement;

    const BALANCE_TTL_MS = 60 * 1000;
    const BALANCE_FAILURE_TTL_MS = 10 * 1000;

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

    /* __PRICING__ */

    /**
     * Read the API-key balance through the authenticated local Host route.
     * The browser never receives the API key; only currency amounts cross.
     * @returns {Promise<{kind: 'ready', wallets: object[], bonusWallets: object[]} | undefined>} Safe balance or undefined.
     */
    async function readApiKeyBalance() {
      const base = globalThis.__DSH_TRANSPORT__?.streamBaseUrl;
      const urls = ['/api/deepseek-peak-whale/balance'];
      if (typeof base === 'string' && base !== '') {
        try {
          const absolute = new URL('/api/deepseek-peak-whale/balance', base).toString();
          if (!urls.includes(absolute)) urls.push(absolute);
        } catch {
          // A malformed transport hint leaves the relative route as the only attempt.
        }
      }
      for (const url of urls) {
        try {
          const response = await fetch(url, {
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) continue;
          const body = await response.json();
          if (body?.ok === true && Array.isArray(body.wallets) && body.wallets.length > 0) {
            return { kind: 'ready', wallets: body.wallets, bonusWallets: [] };
          }
        } catch {
          // Try the next carrier before reporting the balance unavailable.
        }
      }
      return undefined;
    }

    /**
     * Turn the balance query into the tooltip's credit line.
     * @param {{kind: string, wallets?: object[], bonusWallets?: object[]} | undefined} credit - Latest balance state.
     * @param {(key: string) => string} t - Locale lookup.
     * @returns {string | null} Credit line, or null when no source is available.
     */
    function creditLine(credit, t) {
      if (credit === undefined || credit.kind === 'loading') return t('creditChecking');
      if (credit.kind === 'signed-out' || credit.kind === 'unavailable') return t('creditUnavailable');
      const wallets = (credit.wallets ?? []).map((wallet) => formatWallet(wallet));
      const bonus = (credit.bonusWallets ?? [])
        .filter((wallet) => Number(wallet.balance) > 0)
        .map((wallet) => formatWallet(wallet));
      const text = [
        wallets.length > 0 ? wallets.join(' / ') : null,
        bonus.length > 0 ? `${bonus.join(' / ')} ${t('bonus')}` : null,
      ].filter(Boolean).join(' + ');
      return text === '' ? t('creditUnavailable') : `${t('credit')} ${text}`;
    }

    /**
     * Render the existing sidebar whale in the current pricing color with a
     * hover/focus tooltip showing the rate countdown and account credit.
     * @param {{size: number, loadBalance: () => Promise<object>, t: (key: string) => string}} props - Sidebar mark owner props and injected helpers.
     * @returns {React.ReactElement} The recolored mark.
     */
    function PeakWhale({ size, loadBalance, t }) {
      const [peak, setPeak] = React.useState(() => isPeak(new Date()));
      const [now, setNow] = React.useState(() => Date.now());
      const [active, setActive] = React.useState(false);
      const [credit, setCredit] = React.useState(undefined);

      React.useEffect(() => {
        const update = () => {
          const next = isPeak(new Date());
          setPeak((current) => current === next ? current : next);
        };
        update();
        const timer = window.setInterval(update, 15000);
        return () => { window.clearInterval(timer); };
      }, []);

      React.useEffect(() => {
        if (!active) return;
        setNow(Date.now());
        const timer = window.setInterval(() => { setNow(Date.now()); }, 1000);
        return () => { window.clearInterval(timer); };
      }, [active]);

      const requestCredit = () => {
        if (credit === undefined) setCredit({ kind: 'loading' });
        void loadBalance().then(setCredit).catch(() => { setCredit({ kind: 'unavailable' }); });
      };

      const next = nextTransition(new Date(now));
      const lines = [
        peak ? t('peak') : t('offPeak'),
        `${peak ? t('peakEnds') : t('offPeakEnds')} ${formatRemaining(next.at.getTime() - now)}`,
      ];
      const creditText = creditLine(credit, t);
      if (creditText !== null) lines.push(creditText);

      return h(Tooltip, {
        label: () => lines.join('\n'),
        side: 'right',
        align: 'start',
        delayMs: 250,
        maxWidth: 280,
        portal: true,
      }, h('span', {
        'data-deepseek-pricing': peak ? 'peak' : 'off-peak',
        style: {
          display: 'inline-flex',
          color: peak ? RATE_COLORS.peak : RATE_COLORS.offPeak,
          lineHeight: 0,
        },
        onPointerEnter: () => { setActive(true); requestCredit(); },
        onPointerLeave: () => { setActive(false); },
        onFocus: () => { setActive(true); requestCredit(); },
        onBlur: () => { setActive(false); },
      }, h(FishLogo, { size })));
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.account', 'accountUi'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('deepseek-peak-whale', { en: EN }), 'peak whale: dictionaries');
        let cached;
        let pending;
        let generation = 0;
        const loadBalance = () => {
          const account = ctx.accountUi.getSnapshot();
          const accountStatus = account.view === undefined
            ? 'loading'
            : account.failed ? 'unavailable'
              : account.view.status === 'credential-stored' ? 'signed-in' : 'signed-out';
          if (cached !== undefined && Date.now() - cached.at < cached.ttl) return Promise.resolve(cached.value);
          if (pending !== undefined) return pending;
          const requestGeneration = generation;
          let request;
          request = (async () => {
            let value;
            if (accountStatus === 'signed-in') {
              try {
                const locale = ctx.locale.getSnapshot().active ?? 'en';
                const result = await ctx.remote.account.getBalance(ctx.accountUi.clientMetadata(locale));
                if (result.ok && result.value?.status === 'ready') {
                  value = {
                    kind: 'ready',
                    wallets: result.value.value,
                    bonusWallets: result.value.bonusWallets,
                  };
                }
              } catch {
                // The API-key route below is an independent balance source.
              }
            }
            if (value === undefined) {
              const fallback = await readApiKeyBalance();
              if (fallback !== undefined) value = fallback;
              else if (accountStatus === 'signed-in' || accountStatus === 'unavailable') value = { kind: 'unavailable' };
              else value = { kind: 'signed-out' };
            }
            if (requestGeneration !== generation) return { kind: 'unavailable' };
            cached = {
              at: Date.now(),
              ttl: value.kind === 'ready' ? BALANCE_TTL_MS : BALANCE_FAILURE_TTL_MS,
              value,
            };
            return value;
          })().finally(() => {
            if (pending === request) pending = undefined;
          });
          pending = request;
          return pending;
        };
        ctx.effect(() => ctx.on('account-ui/change', (_state, reset) => {
          if (!reset) return;
          generation += 1;
          cached = undefined;
          pending = undefined;
        }), 'peak whale: balance generation');

        // Shadow the shipped mark at a lower priority; both the expanded row and
        // the collapsed rail render this same slot.
        ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({
          name: 'sidebar.brand.mark',
          priority: -1,
          locale: 'deepseek-peak-whale',
          inject: () => ({ loadBalance }),
        }, PeakWhale));
      },
    };
  },
});

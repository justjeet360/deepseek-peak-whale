/**
 * Host half of the peak-whale bundle. It exposes one authenticated balance
 * read so the browser can show API-key credit without ever receiving the key.
 */
const BALANCE_PATH = '/api/deepseek-peak-whale/balance'
const BALANCE_ORIGIN = 'https://api.deepseek.com/user/balance'
const BALANCE_TIMEOUT_MS = 10000
const AMOUNT_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

/**
 * Resolve the configured DeepSeek API key from the credential store, falling
 * back to the launch environment for compositions without that service.
 * @param {import('@deepseek-ai/cordis').Context} ctx - Host plugin context.
 * @returns {Promise<string | undefined>} The secret value, never logged.
 */
async function resolveApiKey(ctx) {
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    try {
      const hit = await credentials.resolve('DEEPSEEK_API_KEY')
      if (typeof hit?.value === 'string' && hit.value !== '') return hit.value
    } catch {
      // A missing or unavailable store falls through to the environment.
    }
  }
  const value = process.env.DEEPSEEK_API_KEY
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * Read the API-key account balance and project only currency amounts.
 * @param {import('@deepseek-ai/cordis').Context} ctx - Host plugin context.
 * @param {AbortSignal} requestSignal - Client request lifetime.
 * @returns {Promise<{ok: true, wallets: {currency: string, balance: string}[]} | {ok: false, reason: string}>} Safe result.
 */
async function readBalance(ctx, requestSignal) {
  const key = await resolveApiKey(ctx)
  if (key === undefined) return { ok: false, reason: 'missing' }
  try {
    const response = await fetch(BALANCE_ORIGIN, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.any([requestSignal, AbortSignal.timeout(BALANCE_TIMEOUT_MS)]),
    })
    if (!response.ok) return { ok: false, reason: 'http' }
    const body = await response.json()
    const infos = Array.isArray(body?.balance_infos) ? body.balance_infos : []
    const wallets = infos.flatMap((info) => {
      if (info === null || typeof info !== 'object') return []
      if (info.currency !== 'CNY' && info.currency !== 'USD') return []
      if (typeof info.total_balance !== 'string' || !AMOUNT_PATTERN.test(info.total_balance)) return []
      return [{ currency: info.currency, balance: info.total_balance }]
    })
    if (wallets.length === 0) return { ok: false, reason: 'format' }
    return { ok: true, wallets }
  } catch {
    return { ok: false, reason: 'network' }
  }
}

/** Required service: the authenticated browser/Host transport. */
export const inject = ['connection']

/**
 * Register the authenticated balance route.
 * @param {import('@deepseek-ai/cordis').Context} ctx - Host plugin context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.connection.fetch.register({
    path: BALANCE_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async (request) => Response.json(
      await readBalance(ctx, request.signal),
      { headers: { 'cache-control': 'no-store' } },
    ),
  }), 'deepseek-peak-whale: balance route')
}

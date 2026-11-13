import fetch from 'node-fetch'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent'

const minutesApart = (a, b) =>
  Math.abs(new Date(a.requestedTime || a.createdAt).getTime() - new Date(b.requestedTime || b.createdAt).getTime()) / 60000

function scoreCandidate(target, candidate) {
  const gap = minutesApart(target, candidate)
  // A shared ride is valid only when the complete CUET journey is identical.
  // Matching one endpoint, or matching the endpoints in reverse order, is not
  // enough: it can send a student in the wrong direction.
  if (!target.from || !target.to || target.from === target.to) return null
  if (candidate.from !== target.from || candidate.to !== target.to) return null
  if (!Number.isFinite(gap) || gap > 10) return null
  if (Number(target.seats || 1) !== 1 || Number(candidate.seats || 1) >= 2) return null
  const timeScore = Math.max(0, 20 - gap * 2)
  return {
    rideId: candidate.id,
    score: Math.round(100 * 0.6 + timeScore),
    reason: `Exact same CUET pickup and destination; ${Math.round(gap)} min apart`,
  }
}

/**
 * Rank feasible shared-ride candidates using route overlap, pickup time and seat capacity.
 * Gemini may refine the explanations/ranking, but its output is validated against this
 * deterministic candidate set. The local scorer always works without an API key.
 */
export async function findMatches(target, candidates, options = {}) {
  const pool = candidates
    .filter((c) => c.id !== target.id && ['pending', 'accepted', 'arrived'].includes(c.status))
    .map((candidate) => scoreCandidate(target, candidate))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  if (!pool.length) return []
  const key = process.env.GEMINI_API_KEY
  if (!key || options.useAI === false) return pool

  const allowed = new Set(pool.map((item) => item.rideId))
  const prompt = `You are assisting a campus shared-rickshaw service. Rank only the supplied feasible candidate ride IDs. All candidates already have the exact same pickup and destination in the same direction, are within 10 minutes, and have enough seats. Do not broaden route compatibility. Do not invent IDs or claim a route is feasible if it is not. Return ONLY JSON: [{"rideId":"...","reason":"short explanation"}]. Candidates: ${JSON.stringify(pool)}`

  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    })
    if (!res.ok) throw new Error(`Gemini returned HTTP ${res.status}`)
    const data = await res.json()
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
    const parsed = JSON.parse(raw.replace(/```json|\`\`\`/g, '').trim())
    if (!Array.isArray(parsed)) return pool
    const ranked = parsed
      .filter((item) => item && allowed.has(item.rideId))
      .map((item) => ({ ...pool.find((p) => p.rideId === item.rideId), reason: String(item.reason || pool.find((p) => p.rideId === item.rideId).reason).slice(0, 160) }))
    const seen = new Set(ranked.map((item) => item.rideId))
    return [...ranked, ...pool.filter((item) => !seen.has(item.rideId))]
  } catch (err) {
    console.error('Gemini ride ranking failed; using local ranking:', err.message)
    return pool
  }
}

/**
 * Optimize a shared ride's ordered campus stops. Gemini can suggest an ordering;
 * the result is accepted only if it contains exactly the known stops. When unavailable,
 * the deterministic fallback keeps pickup-before-dropoff constraints and groups shared
 * endpoints first. No travel times or road distances are fabricated.
 */
export async function optimizeSharedRoute(rides) {
  const stops = [...new Set(rides.flatMap((ride) => [ride.from, ride.to]))]
  if (stops.length < 2) return { stops, method: 'direct' }

  const key = process.env.GEMINI_API_KEY
  if (key) {
    const prompt = `Optimize the order of these CUET campus locations for one shared rickshaw trip. Return ONLY a JSON array of location names, using every supplied location exactly once and no other names. Prefer an order that serves shared route endpoints efficiently. Locations: ${JSON.stringify(stops)}. Ride legs (each pickup must occur before its own dropoff): ${JSON.stringify(rides.map((r) => ({ from: r.from, to: r.to })))}`
    try {
      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      })
      if (!res.ok) throw new Error(`Gemini returned HTTP ${res.status}`)
      const data = await res.json()
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
      const parsed = JSON.parse(raw.replace(/```json|\`\`\`/g, '').trim())
      if (Array.isArray(parsed) && parsed.length === stops.length &&
          new Set(parsed).size === stops.length && parsed.every((stop) => stops.includes(stop)) &&
          rides.every((ride) => parsed.indexOf(ride.from) < parsed.indexOf(ride.to))) {
        return { stops: parsed, method: 'gemini' }
      }
    } catch (err) {
      console.error('Gemini route optimization failed; using safe fallback:', err.message)
    }
  }

  // Deterministic topological ordering: every pickup must appear before its
  // corresponding drop-off. Prefer frequently used pickup points when several
  // stops are ready. This is a stop-order heuristic, not turn-by-turn navigation.
  const outgoing = new Map(stops.map((stop) => [stop, []]))
  const indegree = new Map(stops.map((stop) => [stop, 0]))
  rides.forEach((ride) => {
    if (!outgoing.get(ride.from).includes(ride.to)) {
      outgoing.get(ride.from).push(ride.to)
      indegree.set(ride.to, indegree.get(ride.to) + 1)
    }
  })
  const pickupCounts = new Map(stops.map((stop) => [stop, rides.filter((ride) => ride.from === stop).length]))
  const ready = stops.filter((stop) => indegree.get(stop) === 0)
  const ordered = []
  while (ready.length) {
    ready.sort((a, b) => (pickupCounts.get(b) || 0) - (pickupCounts.get(a) || 0))
    const current = ready.shift()
    ordered.push(current)
    for (const next of outgoing.get(current)) {
      indegree.set(next, indegree.get(next) - 1)
      if (indegree.get(next) === 0) ready.push(next)
    }
  }
  if (ordered.length !== stops.length) return { stops, method: 'safe-default' }
  return { stops: ordered, method: 'heuristic' }
}

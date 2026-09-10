import fetch from 'node-fetch'

const GEMINI_URL = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`

/**
 * Rule-based fallback: match requests on the same route, requested
 * within 20 minutes of each other.
 */
function ruleBasedMatch(target, candidates) {
  const targetTime = new Date(target.createdAt).getTime()
  return candidates
    .filter((c) => c.id !== target.id)
    .filter((c) => c.from === target.from && c.to === target.to)
    .filter((c) => Math.abs(new Date(c.createdAt).getTime() - targetTime) <= 20 * 60 * 1000)
    .map((c) => ({ rideId: c.id, reason: 'Same route, close request time' }))
}

/**
 * Ask Gemini to decide which pending ride requests should be grouped
 * with the target request. Falls back to rule-based matching if no
 * API key is set or the call fails.
 */
export async function findMatches(target, candidates) {
  const key = process.env.GEMINI_API_KEY
  const pool = candidates.filter((c) => c.id !== target.id && c.status === 'pending')

  if (!key) {
    return ruleBasedMatch(target, pool)
  }

  const prompt = `You are a ride-matching assistant for a university campus shared-rickshaw app.
Given a target ride request and a list of other pending ride requests, decide which ones would
make good ride-share companions for the target rider. Prioritize: (1) same or very similar route
(same pickup and destination), (2) requested at a similar time (within about 20 minutes).
Respond ONLY with a JSON array, no other text, of objects like:
[{"rideId": "abc123", "reason": "short reason"}]
If no good matches, respond with [].

Target request: ${JSON.stringify({ from: target.from, to: target.to, createdAt: target.createdAt })}

Other pending requests: ${JSON.stringify(
    pool.map((p) => ({ rideId: p.id, from: p.from, to: p.to, createdAt: p.createdAt }))
  )}`

  try {
    const res = await fetch(GEMINI_URL(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    })
    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) return parsed
    return ruleBasedMatch(target, pool)
  } catch (err) {
    console.error('Gemini matching failed, using rule-based fallback:', err.message)
    return ruleBasedMatch(target, pool)
  }
}

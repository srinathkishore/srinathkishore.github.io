import { readFile, writeFile, mkdir } from 'node:fs/promises';

const CHESS_USER = 'srinath_kishore';
const LEETCODE_USER = 'user7929B';
const OUT = new URL('../data/stats.json', import.meta.url);
const UA = 'srinathkishore.github.io stats bot (github.com/srinathkishore)';

async function chess() {
  const res = await fetch(`https://api.chess.com/pub/player/${CHESS_USER}/stats`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`chess.com ${res.status}`);
  const d = await res.json();
  let games = 0, wins = 0;
  for (const mode of ['chess_rapid', 'chess_blitz', 'chess_bullet', 'chess_daily']) {
    const r = d[mode] && d[mode].record;
    if (!r) continue;
    games += (r.win || 0) + (r.loss || 0) + (r.draw || 0);
    wins += r.win || 0;
  }
  if (!games) throw new Error('chess.com: no games in response');
  const rating = (mode) => ({ rating: d[mode]?.last?.rating ?? null, best: d[mode]?.best?.rating ?? null });
  return { user: CHESS_USER, games, wins, blitz: rating('chess_blitz'), rapid: rating('chess_rapid'), bullet: rating('chess_bullet') };
}

async function leetcode() {
  const query = `query ($u: String!) { matchedUser(username: $u) { submitStatsGlobal { acSubmissionNum { difficulty count } } } }`;
  const res = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA, Referer: 'https://leetcode.com' },
    body: JSON.stringify({ query, variables: { u: LEETCODE_USER } }),
  });
  if (!res.ok) throw new Error(`leetcode ${res.status}`);
  const nums = (await res.json())?.data?.matchedUser?.submitStatsGlobal?.acSubmissionNum;
  if (!nums) throw new Error('leetcode: user not found / unexpected response');
  const count = (k) => nums.find((n) => n.difficulty === k)?.count ?? 0;
  return { user: LEETCODE_USER, solved: count('All'), easy: count('Easy'), medium: count('Medium'), hard: count('Hard') };
}

const prev = await readFile(OUT, 'utf8').then(JSON.parse).catch(() => ({}));
const next = { ...prev };
let failures = 0;
for (const [key, fn] of [['chess', chess], ['leetcode', leetcode]]) {
  try {
    const data = await fn();
    const same = prev[key] && JSON.stringify({ ...prev[key], updatedAt: 0 }) === JSON.stringify({ ...data, updatedAt: 0 });
    next[key] = same ? prev[key] : { ...data, updatedAt: new Date().toISOString() };
    console.log(`${key}: ${same ? 'unchanged' : 'updated'}`);
  } catch (err) {
    failures++;
    console.warn(`${key}: kept previous values (${err.message})`);
  }
}
await mkdir(new URL('.', OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(next, null, 2) + '\n');
if (failures === 2) process.exit(1);

const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const appPath = [
  path.resolve(__dirname, 'gambito-platform/index.html'),
  path.resolve(__dirname, 'index.html')
].find(candidate => fs.existsSync(candidate));
let html = fs.readFileSync(appPath, 'utf8');

const testScript = String.raw`
<script>
window.__E2E_LOG = [];
window.__E2E_DONE = false;
window.__E2E_FAILURE = null;

function __report(label, round) {
  const ids = [];
  let boards = 0;
  let byes = 0;
  let walkovers = 0;

  round.pairs.forEach(pair => {
    if (pair.bye) {
      ids.push(pair.bye);
      if (pair.result === 'wo') walkovers++;
      else byes++;
    } else {
      boards++;
      ids.push(pair.white, pair.black);
    }
  });

  const uniqueIds = new Set(ids);
  const counts = {
    entries: round.pairs.length,
    boards,
    boardPlayers: boards * 2,
    byes,
    walkovers,
    appearances: ids.length,
    uniquePlayers: uniqueIds.size,
    missingPlayers: tournament.players.filter(player => !uniqueIds.has(player.id)).map(player => player.id),
    duplicateAppearances: ids.length - uniqueIds.size
  };
  window.__E2E_LOG.push(label + ': ' + JSON.stringify(counts));
  return counts;
}

function __assert(condition, message) {
  if (!condition) throw new Error(message);
}

function __setAllResults(roundIndex) {
  const pairs = tournament.rounds[roundIndex].pairs;
  pairs.forEach((pair, pairIndex) => {
    if (!pair.bye) setResult(roundIndex, pairIndex, pairIndex % 2 === 0 ? '1-0' : '0.5-0.5');
  });
}

function __assertCompleteTen(counts, label) {
  __assert(counts.appearances === 10, label + ': expected 10 player appearances, got ' + counts.appearances);
  __assert(counts.uniquePlayers === 10, label + ': expected 10 unique players, got ' + counts.uniquePlayers);
  __assert(counts.missingPlayers.length === 0, label + ': missing ' + counts.missingPlayers.join(', '));
  __assert(counts.duplicateAppearances === 0, label + ': duplicate player appearance');
}

function __emptyTournament() {
  return {
    name: '', system: 'swiss', gameType: 'xadrez', totalRounds: 5,
    pointsWin: 1, pointsDraw: 0.5, pointsLoss: 0,
    players: [], rounds: [], rrSchedule: null, currentRoundIndex: -1,
    tiebreakCriteria: null, tiebreakEnabled: null
  };
}

async function __runE2E() {
  try {
    localStorage.clear();
    tournament = __emptyTournament();
    // The emoji guarantees that standard Base64 contains "+", which must be
    // percent-encoded before it is placed in a URL query parameter.
    tournament.name = 'E2E Swiss withdrawal 😀';
    for (let i = 1; i <= 10; i++) {
      tournament.players.push({
        id: 'p' + i,
        name: 'Player ' + i,
        rating: 2200 - i * 10,
        title: '',
        pairingNumber: i
      });
    }

    generateNextRound();
    __assertCompleteTen(__report('round 1 generated', tournament.rounds[0]), 'round 1 generated');
    __setAllResults(0);
    __report('round 1 results set', tournament.rounds[0]);

    generateNextRound();
    __assertCompleteTen(__report('round 2 generated', tournament.rounds[1]), 'round 2 generated');
    __setAllResults(1);
    __report('round 2 results set', tournament.rounds[1]);

    withdrawPlayer('p1');
    __assert(tournament.players.find(player => player.id === 'p1').withdrawn === true, 'withdrawPlayer did not mark p1 withdrawn');
    window.__E2E_LOG.push('after withdrawal: players=10, active=' + tournament.players.filter(player => !player.withdrawn).length + ', withdrawn=' + tournament.players.filter(player => player.withdrawn).length);

    generateNextRound();
    const generatedCounts = __report('round 3 generated', tournament.rounds[2]);
    __assertCompleteTen(generatedCounts, 'round 3 generated');
    __assert(generatedCounts.boards === 4, 'round 3 should have four playable boards');
    __assert(generatedCounts.byes === 1, 'round 3 should have one active BYE');
    __assert(generatedCounts.walkovers === 1, 'round 3 should have one withdrawn W.O.');

    saveState();
    tournament = __emptyTournament();
    __assert(tournament.rounds.length === 0, 'tournament was not cleared before loadState');
    loadState();
    const persistedCounts = __report('round 3 after save/load', tournament.rounds[2]);
    __assertCompleteTen(persistedCounts, 'round 3 after save/load');
    __assert(persistedCounts.walkovers === 1, 'save/load lost the W.O. entry');

    renderPairings();
    const adminCards = document.querySelectorAll('#round-panel-2 .matchup-card');
    const adminWOs = Array.from(adminCards).filter(card => card.textContent.includes('W.O.'));
    const adminByes = Array.from(adminCards).filter(card => card.textContent.includes('BYE'));
    window.__E2E_LOG.push('admin render round 3: cards=' + adminCards.length + ', W.O. cards=' + adminWOs.length + ', BYE cards=' + adminByes.length);
    __assert(adminCards.length === persistedCounts.entries, 'renderPairings omitted round 3 entries');
    __assert(adminWOs.length === 1, 'renderPairings omitted the W.O. card');
    __assert(adminByes.length === 1, 'renderPairings omitted the BYE card');

    window.__COPIED_PUBLIC_URL = null;
    copyPublicLink();
    await Promise.resolve();
    const publicUrl = window.__COPIED_PUBLIC_URL;
    __assert(publicUrl, 'copyPublicLink did not serialize a spectator URL');
    __assert(new URL(publicUrl).search.includes('%2B'), 'spectator Base64 "+" was not URL-encoded');
    window.__E2E_LOG.push('spectator URL: encodedChars=' + new URL(publicUrl).searchParams.get('v').length);

    tournament = __emptyTournament();
    history.replaceState({}, '', publicUrl);
    __assert(trySpectatorMode() === true, 'trySpectatorMode could not deserialize the public URL');
    const spectatorCounts = __report('round 3 after spectator decode', tournament.rounds[2]);
    __assertCompleteTen(spectatorCounts, 'round 3 after spectator decode');
    __assert(spectatorCounts.walkovers === 1, 'spectator decode lost the W.O. entry');

    spectatorRoundIndex = 2;
    renderSpectatorPairings();
    const spectatorCards = document.querySelectorAll('#spec-round-2 .matchup-card');
    const spectatorWOs = Array.from(spectatorCards).filter(card => card.textContent.includes('W.O.'));
    const spectatorByes = Array.from(spectatorCards).filter(card => card.textContent.includes('BYE'));
    window.__E2E_LOG.push('spectator render round 3: cards=' + spectatorCards.length + ', W.O. cards=' + spectatorWOs.length + ', BYE cards=' + spectatorByes.length);
    __assert(spectatorCards.length === spectatorCounts.entries, 'spectator render omitted round 3 entries');
    __assert(spectatorWOs.length === 1, 'spectator render omitted the W.O. card');
    __assert(spectatorByes.length === 1, 'spectator render omitted the BYE card');

    const legacyPublicUrl = publicUrl.replace(/%2B/gi, '+');
    tournament = __emptyTournament();
    history.replaceState({}, '', legacyPublicUrl);
    __assert(trySpectatorMode() === true, 'legacy spectator URL with raw "+" could not be recovered');
    const legacyCounts = __report('round 3 after legacy spectator decode', tournament.rounds[2]);
    __assertCompleteTen(legacyCounts, 'round 3 after legacy spectator decode');
    __assert(legacyCounts.walkovers === 1, 'legacy spectator decode lost the W.O. entry');

    const ranking = getRankingList();
    const withdrawn = ranking.find(player => player.id === 'p1');
    __assert(withdrawn, 'withdrawn player disappeared from getRankingList');
    __assert(Number.isFinite(withdrawn.points), 'withdrawn player has invalid points');
    __assert(computePointsByRound('p1').length === 3, 'computePointsByRound did not preserve all rounds for withdrawn player');
    window.__E2E_LOG.push('ranking checks: players=' + ranking.length + ', p1Points=' + withdrawn.points + ', p1Rounds=' + computePointsByRound('p1').length);

    window.__E2E_LOG.push('PASS: full app workflow preserved all 10 players');
  } catch (error) {
    window.__E2E_FAILURE = error.stack || error.message;
    window.__E2E_LOG.push('FAIL: ' + error.message);
  } finally {
    window.__E2E_DONE = true;
  }
}

setTimeout(__runE2E, 50);
</script>
`;

html = html.replace('</body>', testScript + '</body>');

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => {
  if (!String(error.message).includes('Could not load link')) console.error(error);
});

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  url: 'http://localhost/',
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    window.confirm = () => true;
    window.alert = () => {};
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText(value) {
          window.__COPIED_PUBLIC_URL = value;
          return Promise.resolve();
        }
      }
    });
  }
});

const timeout = setTimeout(() => {
  console.error('FAIL: test harness timed out');
  dom.window.close();
  process.exit(1);
}, 10000);

const poll = setInterval(() => {
  if (!dom.window.__E2E_DONE) return;
  clearInterval(poll);
  clearTimeout(timeout);
  for (const line of dom.window.__E2E_LOG || []) console.log(line);
  const failure = dom.window.__E2E_FAILURE;
  if (failure) console.error(failure);
  dom.window.close();
  process.exit(failure ? 1 : 0);
}, 25);

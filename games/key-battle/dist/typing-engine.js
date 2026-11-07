/* Pure typing/battle rules. No network, browser, rendering or audio dependency. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KeyBattle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LESSONS = {
    warmup: {
      title: 'Short words', thai: 'Short words, 2–5 letters',
      words: 'play rock beat song glow note fire star wave jump blue pink gold home good kind calm slow fast sun moon sky rain wind tree leaf bird cat dog run walk look read book pen hand help make give take love time day night back come find just like more new now one out see some then they this turn up use very want way well what when who will with word yes you your'.split(' ')
    },
    everyday: {
      title: 'Everyday words', thai: 'Common everyday words',
      words: 'music rhythm guitar dragon bright little people happy simple learn practice focus gentle friend family morning evening water coffee school garden window answer world dream begin again better quiet sound light change follow listen travel summer together yellow purple typing keyboard power energy melody perfect'.split(' ')
    },
    sentences: {
      title: 'Short sentences', thai: 'Type short sentences word by word',
      sentences: [
        'take your time and find your rhythm', 'a little practice goes a long way',
        'the music makes the whole room glow', 'we can learn something new today',
        'keep your eyes on the words ahead', 'small steps can lead to big dreams',
        'a bright star shines above the city', 'let the sound carry you through the night',
        'play a song and share it with a friend', 'good habits grow a little every day',
        'the little dragon wants to hear more music', 'read each word and type with care'
      ]
    }
  };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  class Session {
    constructor(options = {}) {
      this.mode = options.mode === 'battle' ? 'battle' : 'practice';
      this.lesson = LESSONS[options.lesson] ? options.lesson : 'warmup';
      this.random = options.random || Math.random;
      this.status = 'ready'; this.elapsed = 0; this.typingElapsed = 0; this.duration = 150;
      this.started = false; this.buffer = ''; this.words = []; this.phrase = '';
      this.wordHadError = false; this.totalKeys = 0; this.correctKeys = 0;
      this.committedChars = 0; this.completedWords = 0; this.perfectWords = 0;
      this.combo = 0; this.bestCombo = 0; this.charge = 0; this.ultimates = 0;
      this.hp = 5; this.maxHp = 5; this.bossHp = 100; this.phase = 1;
      this.beat = 'charge'; this.beatDuration = 12; this.beatLeft = 12; this.round = 1;
      this.ammo = []; this.volley = []; this.volleyIndex = 0; this.parked = null;
      this.reaction = null; this.wordSerial = 0; this.critical = false;
      this.failedWords = 0; this.criticalMisses = 0; this.bossTurns = 0; this.parries = 0;
      this.lastFailureDamage = 0; this.returnBeat = null; this.wordToken = 0;
      this.mistakes = {}; this.wordErrors = {}; this.events = [];
      this.fillQueue(); this.armWord();
    }
    pick(list) { return list[Math.floor(this.random() * list.length) % list.length]; }
    fillQueue() {
      const lesson = LESSONS[this.lesson];
      if (lesson.sentences) {
        if (!this.words.length) {
          const choices = lesson.sentences.filter(s => s !== this.phrase);
          this.phrase = this.pick(choices); this.words.push(...this.phrase.split(' '));
        }
      } else {
        while (this.words.length < 9) {
          const previous = this.words.at(-1);
          this.words.push(this.pick(lesson.words.filter(w => w !== previous)));
        }
      }
    }
    get target() { return this.reaction?.target || this.words[0] || ''; }
    get acceptingInput() { return this.status === 'playing' && (this.mode === 'practice' || ['charge','defend','counter'].includes(this.beat)); }
    get stage() { return this.phase === 2 ? 3 : this.round === 1 ? 1 : 2; }
    armWord(danger = this.mode === 'battle' && (this.wordSerial + 1) % (this.phase === 2 ? 3 : 4) === 0) {
      this.critical = danger; this.wordToken++;
      this.wordDuration = clamp(4.5 + this.target.length * .65 - (this.phase === 2 ? .75 : 0) + (danger ? 2 : 0), 6, 14);
      this.wordLeft = this.wordDuration; this.readGrace = danger ? 1 : .55;
      this.emit('word', { critical: danger, token: this.wordToken });
    }
    setBeat(beat, duration) {
      this.beat = beat; this.beatDuration = duration; this.beatLeft = duration;
      this.emit('beat', { beat, round: this.round });
    }
    nextWord() {
      this.buffer = ''; this.wordHadError = false; this.words.shift(); this.wordSerial++;
      this.fillQueue(); this.armWord();
    }
    emit(type, data = {}) { this.events.push({ type, ...data }); }
    drain() { return this.events.splice(0); }
    start() { if (this.status === 'ready') { this.status = 'playing'; this.emit('start'); } }
    pause() { if (this.status === 'playing') { this.status = 'paused'; this.emit('pause'); } }
    resume() { if (this.status === 'paused') { this.status = 'playing'; this.emit('resume'); } }
    finish(reason = 'finished') {
      if (!['playing', 'paused'].includes(this.status)) return;
      this.status = 'finished'; this.reason = reason; this.emit('finish', { reason });
    }
    mistake(expected) {
      this.combo = 0; this.wordHadError = true;
      const key = expected === ' ' ? 'Space' : expected || 'extra';
      this.mistakes[key] = (this.mistakes[key] || 0) + 1;
      this.wordErrors[this.target] = (this.wordErrors[this.target] || 0) + 1;
      this.emit('mistake');
    }
    input(key) {
      if (!this.acceptingInput) return false;
      if (key === 'Backspace') {
        this.buffer = this.buffer.slice(0, -1); this.emit('edit'); return true;
      }
      if (key !== ' ' && !/^[a-zA-Z]$/.test(key)) return false;
      // A blank Space between words is harmless; no phantom accuracy penalty.
      if (key === ' ' && !this.buffer) return true;
      this.started = true; this.totalKeys++;
      if (key === ' ') {
        if (this.buffer === this.target) { this.correctKeys++; this.completeWord(); }
        else {
          this.mistake(this.target[this.buffer.length] || ' ');
          if (this.mode === 'battle') this.failWord('wrong'); else this.emit('incomplete');
        }
        return true;
      }
      const i = this.buffer.length;
      if (i >= this.target.length + 8) { this.mistake(' '); return true; }
      const correct = key === this.target[i] && this.target.startsWith(this.buffer);
      this.buffer += key;
      if (correct) { this.correctKeys++; this.emit('key', { key }); }
      else this.mistake(this.target[i]);
      return true;
    }
    completeWord() {
      const word = this.target, perfect = !this.wordHadError;
      this.completedWords++; this.committedChars += word.length + 1;
      if (perfect) { this.combo++; this.perfectWords++; }
      else this.combo = 0;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.charge = Math.min(100, this.charge + (perfect ? 20 : 8));
      let kind = 'shot', damage = 4;
      if (this.charge >= 100 && (this.mode === 'practice' || this.beat !== 'defend')) { kind = 'ultimate'; damage = 18; this.charge = 0; }
      else if (this.combo > 0 && this.combo % 3 === 0) { kind = 'charged'; damage = 7; }
      else if (this.completedWords % 4 === 0) { kind = 'slash'; damage = 5; }
      const attack = { kind, damage, word, perfect };
      if (this.mode === 'practice') { this.strike(attack); this.nextWord(); return; }
      if (this.beat === 'charge') {
        if (this.critical) attack.damage += 3;
        this.ammo.push(attack); this.emit('stored', { count: this.ammo.length, kind, critical: this.critical });
        this.nextWord(); return;
      }
      this.buffer = ''; this.wordHadError = false;
      if (this.beat === 'defend') {
        this.parries++;
        this.emit('dodge', { kind: this.reaction.attack === 'quake' ? 'jump' : this.reaction.attack === 'claw' ? 'slash' : 'dash', attack: this.reaction.attack });
        this.reaction = { target: this.pick(['power','strike','break','echo']), attack: this.reaction.attack };
        this.setBeat('counter', 0); this.armWord(false); this.beatDuration = this.wordDuration; this.beatLeft = this.wordLeft;
      } else {
        this.strike({ ...attack, kind: kind === 'ultimate' ? kind : 'slash', damage: kind === 'ultimate' ? 22 : 12 });
        if (this.status === 'playing') this.setBeat('recover', .85);
      }
    }
    strike(attack) {
      if (this.status !== 'playing' || this.bossHp <= 0) return;
      if (attack.kind === 'ultimate') this.ultimates++;
      this.bossHp = Math.max(0, this.bossHp - attack.damage); this.emit('attack', attack);
      if (!this.bossHp) { this.finish('victory'); return; }
      if (this.phase === 1 && this.bossHp <= 50) {
        this.phase = 2;
        this.emit('phase');
      }
    }
    failWord(reason) {
      if (!this.acceptingInput || this.mode !== 'battle') return;
      const critical = this.critical, damage = critical ? 2 : 1, word = this.target;
      this.failedWords++; if (critical) this.criticalMisses++;
      if (reason === 'timeout') this.wordErrors[word] = (this.wordErrors[word] || 0) + 1;
      this.lastFailureDamage = damage; this.hp = Math.max(0, this.hp - damage); this.combo = 0;
      this.emit('bossAttack', { kind: critical ? 'ultimate' : this.reaction?.attack || (this.phase === 2 ? 'quake' : 'breath'), damage, reason, word });
      this.returnBeat = { beat: this.beat, left: this.beatLeft, duration: this.beatDuration };
      if (this.beat === 'charge') this.nextWord(); else { this.buffer = ''; this.wordHadError = false; }
      this.setBeat('retaliate', critical ? 1.45 : 1.1);
      if (!this.hp) this.finish('defeat');
    }
    beginVolley() {
      this.parked = { buffer: this.buffer, wordHadError: this.wordHadError, wordLeft: this.wordLeft, wordDuration: this.wordDuration, critical: this.critical, readGrace: this.readGrace };
      this.buffer = ''; this.wordHadError = false;
      this.volley = this.ammo.splice(0); this.volleyIndex = 0;
      this.setBeat('volley', 2); this.emit('release', { count: this.volley.length });
    }
    beginDefense() {
      this.bossTurns++;
      const attack = ['breath','claw','quake'][(this.round - 1) % 3];
      this.reaction = { target: attack === 'quake' ? 'jump' : attack === 'claw' ? 'reflect' : 'dash', attack };
      this.buffer = ''; this.wordHadError = false;
      this.setBeat('defend', 0); this.armWord(this.phase === 2 && this.round % 2 === 0);
      this.beatDuration = this.wordDuration; this.beatLeft = this.wordLeft;
      this.emit('bossWindup', { attack, critical: this.critical });
    }
    nextRound() {
      this.round++; this.reaction = null; this.setBeat('charge', this.phase === 2 ? 10 : 12);
      if (this.parked) { Object.assign(this, this.parked); this.parked = null; this.readGrace = Math.max(this.wordLeft<1?1.25:.65, this.readGrace); this.wordToken++; this.emit('word', { critical: this.critical }); }
      else this.armWord();
    }
    tickBattle(dt) {
      if (this.beat === 'volley') {
        this.beatLeft -= dt; const elapsed = this.beatDuration - this.beatLeft;
        while (this.volleyIndex < this.volley.length && elapsed >= .12 + this.volleyIndex * (1.1 / Math.max(1, this.volley.length))) this.strike(this.volley[this.volleyIndex++]);
        if (this.status === 'playing' && this.beatLeft <= 0) this.beginDefense();
        return;
      }
      if (this.beat === 'retaliate' || this.beat === 'recover') {
        this.beatLeft -= dt;
        if (this.beatLeft <= 0) {
          if (this.beat === 'retaliate' && this.returnBeat?.beat === 'charge') {
            const resume = this.returnBeat; this.setBeat('charge', resume.duration); this.beatLeft = resume.left;
            this.returnBeat = null; if (this.beatLeft <= 0) this.beginVolley();
          } else { this.returnBeat = null; this.nextRound(); }
        }
        return;
      }
      const untilWord = this.readGrace + this.wordLeft;
      const untilBeat = this.beat === 'charge' ? Math.max(0, this.beatLeft) : Infinity;
      const step = Math.min(dt, untilWord, untilBeat);
      const grace = Math.min(this.readGrace, step); this.readGrace -= grace;
      this.wordLeft = Math.max(0, this.wordLeft - (step - grace));
      if (this.beat === 'charge') this.beatLeft = Math.max(0, this.beatLeft - step);
      else this.beatLeft = this.wordLeft;
      // Resolve the earlier event; word expiry wins only an actual tie.
      if (untilWord <= dt + 1e-9 && untilWord <= untilBeat + 1e-9) { this.failWord('timeout'); return step; }
      if (untilBeat <= dt + 1e-9) this.beginVolley();
      return step;
    }
    tick(dt) {
      if (this.status !== 'playing' || !this.started || !Number.isFinite(dt) || dt <= 0) return;
      this.elapsed += dt;
      if (this.mode === 'practice') { this.typingElapsed += dt; return; }
      this.typingElapsed += this.tickBattle(dt) || 0;
      if (this.status === 'playing' && this.elapsed >= this.duration) this.finish('timeout');
    }
    stats() {
      let prefix = 0;
      while (prefix < this.buffer.length && this.buffer[prefix] === this.target[prefix]) prefix++;
      let savedPrefix = 0;
      if (this.parked) while (savedPrefix < this.parked.buffer.length && this.parked.buffer[savedPrefix] === this.words[0][savedPrefix]) savedPrefix++;
      return {
        wpm: this.typingElapsed >= 1 ? Math.round((this.committedChars + prefix + savedPrefix) * 12 / this.typingElapsed) : 0,
        accuracy: this.totalKeys ? Math.round(this.correctKeys / this.totalKeys * 100) : 100,
        words: this.completedWords, combo: this.combo, bestCombo: this.bestCombo,
        elapsed: this.elapsed, remaining: Math.max(0, this.duration - this.elapsed),
        mistakes: Object.entries(this.mistakes).sort((a, b) => b[1] - a[1]).slice(0, 5),
        reviewWords: Object.entries(this.wordErrors).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w),
        perfectWords: this.perfectWords, ultimates: this.ultimates, typingElapsed: this.typingElapsed,
        failedWords: this.failedWords, criticalMisses: this.criticalMisses, parries: this.parries, rounds: this.round
      };
    }
  }
  return { Session, LESSONS, clamp };
});

'use strict';

/**
 * Check if the edit distance between two strings is smaller than a threshold
 * `k` defined as the natural logarithm of the length of the first string
 * rounded to the nearest integer.
 * We dont need to trace back the optimal alignment, so we can run the
 * Levenshtein distance algorithm in better than `O(n * m)`.
 * We use only a diagonal stripe of width `2k + 1` in the matrix.
 * See Algorithms on strings, trees, and sequences: computer science and
 * computational biology.
 * Cambridge, UK: Cambridge University Press. pp 263-264. ISBN 0-521-58519-8.
 */

const checkDistance = function(s1, s2) {
  let k = Math.log(s1.length);
  k = Math.round(k);

  if (k === 0) {
    return s1 === s2;
  }
  if (Math.abs(s1.length - s2.length) > k) {
    return false;
  }

  const d = [];
  let i;
  let j;
  let l;
  let m;

  for (i = 0; i <= s1.length; i++) {
    d[i] = []; // Now d is a matrix with s1.length + 1 rows
    d[i][0] = i;
  }
  for (j = 1; j <= s2.length; j++) {
    d[0][j] = j;
  }

  for (i = 1; i <= s1.length; i++) {
    l = i - k < 1 ? 1 : i - k;
    m = i + k > s2.length ? s2.length : i + k;
    for (j = l; j <= m; j++) {
      if (s1.charAt(i - 1) === s2.charAt(j - 1)) {
        d[i][j] = d[i - 1][j - 1];
        continue;
      }
      if (j === l && d[i][j - 1] === undefined) {
        d[i][j] = Math.min(d[i - 1][j - 1] + 1, d[i - 1][j] + 1);
        continue;
      }
      if (j === m && d[i - 1][j] === undefined) {
        d[i][j] = Math.min(d[i][j - 1] + 1, d[i - 1][j - 1] + 1);
        continue;
      }
      d[i][j] = Math.min(d[i][j - 1] + 1, d[i - 1][j - 1] + 1, d[i - 1][j] + 1);
    }
  }

  return d[s1.length][s2.length] <= k;
};

/**
 * Supported artist name abbreviations.
 */

const abbreviations = {
  bfmv: 'bullet for my valentine',
  brmc: 'black rebel motorcycle club',
  ccr: 'creedence clearwater revival',
  elo: 'electric light orchestra',
  fgth: 'frankie goes to hollywood',
  jsbx: 'the jon spencer blues explosion',
  mcr: 'my chemical romance',
  nkotb: 'new kids on the block',
  omd: 'orchestral manoeuvres in the dark',
  pusa: 'the presidents of the united states of america',
  qotsa: 'queens of the stone age',
  ratm: 'rage against the machine',
  rhcp: 'red hot chili peppers',
  soad: 'system of a down',
  dbvh: 'de broer van henk',
  stp: 'stone temple pilots'
};

/**
 * Expose a function to check if the user answer is acceptable.
 */

module.exports = function(pattern, guess, enableartistrules) {
  if (checkDistance(pattern, guess)) {
    return true;
  }

  let _pattern;

  if (~pattern.indexOf('.')) {
    // Ignore dots
    _pattern = pattern.replace(/\./g, '');
    if (checkDistance(_pattern, guess)) {
      return true;
    }
  }
  if (~pattern.indexOf('-')) {
    // Ignore dashes
    _pattern = pattern.replace(/- /g, '');
    console.log(_pattern)
    if (checkDistance(_pattern, guess)) {
      return true;
    }
  }
  if (~pattern.indexOf('+')) {
    // Allow to write "and" in place of "+"
    _pattern = pattern.replace(/\+/, 'and');
    if (checkDistance(_pattern, guess)) {
      return true;
    }
    // Allow to write "en" in place of "+"
    _pattern = pattern.replace(/\+/, 'en');
    if (checkDistance(_pattern, guess)) {
      return true;
    }
  }
  if (~pattern.indexOf(' & ') && !~pattern.indexOf('(')) {
    // Allow to write "and" in place of " & "
    _pattern = pattern.replace(/ & /, ' and ');
    if (checkDistance(_pattern, guess)) {
      return true;
    }
    // Allow to write "en" in place of " & "
    _pattern = pattern.replace(/ & /, ' en ');
    if (checkDistance(_pattern, guess)) {
      return true;
    }
  }

  if (enableartistrules) {
    // Split artist name on " & " and ", " (it can be composed by more names)
    const splits = pattern.split(/ & |, /);
    const multipleartists = splits.length !== 1;

    for (let i = 0; i < splits.length; i++) {
      const artist = splits[i];
      if (multipleartists) {
        if (checkDistance(artist, guess)) {
          return true;
        }
        if (~artist.indexOf('.')) {
          _pattern = artist.replace(/\./g, '');
          if (checkDistance(_pattern, guess)) {
            return true;
          }
        }
      }
      if (artist.indexOf('the ') === 0) {
        // Ignore "the" at the beginning of artist name
        const nothe = artist.replace(/^the /, '');
        if (checkDistance(nothe, guess)) {
          return true;
        }
        if (~nothe.indexOf('.')) {
          _pattern = nothe.replace(/\./g, '');
          if (checkDistance(_pattern, guess)) {
            return true;
          }
        }
        if (nothe === 'jimi hendrix experience') {
          _pattern = nothe.replace(' experience', '');
          if (checkDistance(_pattern, guess)) {
            return true;
          }
        }
      }
      if (artist.indexOf('de ') === 0) {
        // Ignore "the" at the beginning of artist name
        const nothe = artist.replace(/^de /, '');
        if (checkDistance(nothe, guess)) {
          return true;
        }
        if (~nothe.indexOf('.')) {
          _pattern = nothe.replace(/\./g, '');
          if (checkDistance(_pattern, guess)) {
            return true;
          }
        }
        if (nothe === 'jimi hendrix experience') {
          _pattern = nothe.replace(' experience', '');
          if (checkDistance(_pattern, guess)) {
            return true;
          }
        }
      }
      if (guess in abbreviations && artist === abbreviations[guess]) {
        return true;
      }
    }
  } else {
    if (~pattern.indexOf(',')) {
      // Ignore commas
      _pattern = pattern.replace(/,/g, '');
      if (checkDistance(_pattern, guess)) {
        return true;
      }
    }
    if (/\(.+\)\??(?: \[.+\])?/.test(pattern)) {
      // Ignore additional info e.g. "(Love Theme from Titanic)"
      const normalized = pattern.replace(/\(.+\)\??(?: \[.+\])?/, '').trim();
      if (checkDistance(normalized, guess)) {
        return true;
      }
      if (~normalized.indexOf(' & ')) {
        _pattern = normalized.replace(/ & /, ' and ');
        if (checkDistance(_pattern, guess)) {
          return true;
        }
      }
      if (~normalized.indexOf(' & ')) {
        _pattern = normalized.replace(/ & /, ' en ');
        if (checkDistance(_pattern, guess)) {
          return true;
        }
      }
    }
    if (/, [pP]t\. [0-9]$/.test(pattern)) {
      _pattern = pattern.replace(/, [pP]t\. [0-9]$/, '');
      if (checkDistance(_pattern, guess)) {
        return true;
      }
    }
  }

  return false;
};

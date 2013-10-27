/**
 * Module dependencies.
 */

var threshold = require('../config').allowederrors;

/**
 * Check if the edit distance between two strings is smaller than a threshold k.
 * We dont need to trace back the optimal alignment, so we can run the Levenshtein distance 
 * algorithm in better than O(n*m).
 * We use only a diagonal stripe of width 2k+1 in the matrix.
 * See Algorithms on strings, trees, and sequences: computer science and computational biology.
 * Cambridge, UK: Cambridge University Press. pp 263-264. ISBN 0-521-58519-8.
 */

var checkDistance = function(s1, s2, k) {
  if (k === 0) {
    return s1 === s2;
  }
  if (Math.abs(s1.length - s2.length) > k) {
    return false;
  }
  var d = [];
  for (var i=0; i <= s1.length; i++) {
    d[i] = []; // Now d is a matrix with s1.length + 1 rows
    d[i][0] = i;
  }
  for (var j=1; j <= s2.length; j++) {
    d[0][j] = j;
  }
  for (i=1; i <= s1.length; i++) {
    var l = ((i-k) < 1) ? 1 : i-k;
    var m = ((i+k) > s2.length) ? s2.length : i+k;
    for (j=l; j<=m; j++) {
      if (s1.charAt(i-1) === s2.charAt(j-1)) {
        d[i][j] = d[i-1][j-1];
      }
      else {
        if ((j === l) && (d[i][j-1] === undefined)) {
          d[i][j] = Math.min(d[i-1][j-1]+1, d[i-1][j]+1);
        }
        else if ((j === m) && (d[i-1][j] === undefined)) {
          d[i][j] = Math.min(d[i][j-1]+1, d[i-1][j-1]+1);
        }
        else {
          d[i][j] = Math.min(d[i][j-1]+1, d[i-1][j-1]+1, d[i-1][j]+1);
        }
      }
    }
  }
  return d[s1.length][s2.length] <= k;
};

/**
 * Expose a function to check if the user answer is acceptable.
 */

module.exports = function(subject, guess, enableartistrules) {
  if (checkDistance(subject, guess, threshold)) {
    return true;
  }

  // Ignore dots
  if (/\./.test(subject) && 
    checkDistance(subject.replace(/\./g, ''), guess, threshold)) {
    return true;
  }
  // Ignore dashes
  if (/\-/.test(subject) && 
    checkDistance(subject.replace(/\-/g, ''), guess, threshold)) {
    return true;
  }
  // Allow to write "and" in place of "+"
  if (/\+/.test(subject) && 
    checkDistance(subject.replace(/\+/, 'and'), guess, threshold)) {
    return true;
  }
  // Allow to write "and" in place of " & "
  if (/ & /.test(subject) && !/\(/.test(subject) &&
    checkDistance(subject.replace(/ & /, ' and '), guess, threshold)) {
    return true;
  }

  if (enableartistrules) {
    // Split artist name on " & " and ", " (artist name can be composed by more names)
    var splits = subject.split(/ & |, /)
      , multipleartists = splits.length !== 1;
    for (var i = 0; i < splits.length; i++) {
      var artist = splits[i];
      if (multipleartists) {
        if (checkDistance(artist, guess, threshold)) {
          return true;
        }
        if (/\./.test(artist) &&
          checkDistance(artist.replace(/\./g, ''), guess, threshold)) {
          return true;
        }
      }
      // Ignore "the" at the beginning of artist name
      if (/^the /.test(artist)) {
        var nothe = artist.replace(/^the /, '');
        if (checkDistance(nothe, guess, threshold)) {
          return true;
        }
        if (/\./.test(nothe) &&
          checkDistance(nothe.replace(/\./g, ''), guess, threshold)) {
          return true;
        }
        if (/jimi hendrix experience/.test(nothe) &&
          checkDistance(nothe.replace(/ experience/, ''), guess, threshold)) {
          return true;
        }
      }
      if (guess === 'ccr' && artist === 'creedence clearwater revival') {
        return true;
      }
      if (guess === 'elo' && artist === 'electric light orchestra') {
        return true;
      }
      if (guess === 'omd' && artist === 'orchestral manoeuvres in the dark') {
        return true;
      }
    }
  }
  else {
    // Ignore commas
    if (/,/.test(subject) && 
      checkDistance(subject.replace(/,/g, ''), guess, threshold)) {
      return true;
    }
    // Ignore additional info e.g. "(Love Theme from Titanic)"
    if (/\(.+\)\??(?: \[.+\])?/.test(subject)) {
      var normalized = subject.replace(/\(.+\)\??(?: \[.+\])?/, '').trim();
      if (checkDistance(normalized, guess, threshold)) {
        return true;
      }
      if (/ & /.test(normalized) && 
        checkDistance(normalized.replace(/ & /, ' and '), guess, threshold)) {
        return true;
      }
    }
    if (/, [pP]t\. [0-9]$/.test(subject) && 
      checkDistance(subject.replace(/, [pP]t\. [0-9]$/, ''), guess, threshold)) {
      return true;
    }
  }

  return false;
};

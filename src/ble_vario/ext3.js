// ABOUTME: Builds the exercise summary (flight time, max altitude, max above take-off, best avg climb, total climb, best gain, link).
// ABOUTME: Gets plain numbers from main.js getSummaryOutputs(); flight values only after a detected flight; [] if never started.
function (st, um, c, a, f, g, l, h, t) {
  var z = function (v) {
    return v === v && v > 0 ? v : 0;
  };
  var r = [];
  if (!st) return r;
  // Ordered so that a watch showing only the first 4-5 entries drops the least useful (XC addendum §5.3). Best avg
  // climb is the best AVG-window average (not the instant peak a vario shows as its maximum climb). Total climb sums
  // the altitude gained in flight with 3 m hysteresis. h and t are -1 without the XC engine (classic page setting).
  if (f > 0) { // no take-off detected: no flight values at all (a 0 m maximum altitude would be false)
    r.push({ id: 'f', name: 'Flight time', format: 'Duration_FourdigitsFixed', value: f });
    if (a > -1e8) r.push({ id: 'a', name: 'Max altitude', format: 'Altitude_Fivedigits', value: a });
    if (h >= 0) r.push({ id: 'h', name: 'Max above take-off', format: 'Altitude_Fivedigits', value: h });
    r.push(um ? { id: 'c', name: 'Best avg climb', format: 'Count_Fourdigits', value: Math.floor(z(c) * 19.685 + 0.5) * 10, postfix: 'ft/min' }
      : { id: 'c', name: 'Best avg climb', format: 'OneDecimal_Fourdigits', value: Math.floor(z(c) * 10 + 0.5) / 10, postfix: 'm/s' },
    { id: 'g', name: 'Best thermal gain', format: 'Altitude_Fivedigits', value: z(g) });
    if (t >= 0) r.splice(r.length - 1, 0, { id: 't', name: 'Total climb', format: 'Altitude_Fivedigits', value: t });
  }
  r.push({ id: 'l', name: 'Vario link', format: 'Percentage_Threedigits', value: Math.round(z(l)) });
  return r;
}

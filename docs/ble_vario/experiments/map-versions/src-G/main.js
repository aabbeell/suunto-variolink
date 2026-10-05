// ABOUTME: Simulator-only preview of the VarioLink thermal map: main.js only counts seconds; the template draws a
// ABOUTME: synthetic drifting thermal as a trail coloured by lift (red) and sink (blue), fading with age.
var tk = 0;

function evaluate(input, output) {
  tk++;
  output.tk = tk;
}

function getUserInterface() {
  return { template: 'm' };
}

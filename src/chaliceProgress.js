// Tiny shared singleton tracking how many Chalices of Pegacorn Blood the
// current run has collected -- read by ChaliceHUD (the counter) and
// GameFlow (the win check), written by Chalice itself on pickup. Plain
// module-level state, same pattern engine.js's own object list uses.

let collected = 0;
let required = 0;

// Called once per new run (see mapCreator.js) so a restart doesn't inherit
// the previous run's count.
function resetChalices(total) {
  collected = 0;
  required = total;
}

function collectChalice() {
  collected = Math.min(required, collected + 1);
  return collected;
}

function chaliceProgress() {
  return { collected, required };
}

function chalicesComplete() {
  return required > 0 && collected >= required;
}

export {
  chaliceProgress, chalicesComplete, collectChalice, resetChalices,
};

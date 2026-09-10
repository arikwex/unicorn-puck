// Rotate a local point around the vertical axis and project it onto the
// screen. Local x points forward, y points down, and z points sideways.
// The third result is depth: positive is farther into the page.
function orbit3d(x, y, z, angle) {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const rotatedX = x * cosA - z * sinA;
  const rotatedZ = x * sinA + z * cosA;
  return [rotatedX, y - rotatedZ * 0.4, rotatedZ];
}

export default orbit3d;

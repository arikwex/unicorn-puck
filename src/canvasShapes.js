// Two canvas fill primitives shared by every world object that needed
// them, instead of each one (Chalice/Pillar/PlayerCharacter for the
// ellipse, Grub/PlayerCharacter for the circle) redefining an identical
// copy locally.

const TAU = Math.PI * 2;

function fillCircle(context, x, y, radius, color) {
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, radius, 0, TAU);
  context.fill();
}

function fillEllipse(context, x, y, radiusX, radiusY, color) {
  context.fillStyle = color;
  context.beginPath();
  context.ellipse(x, y, radiusX, radiusY, 0, 0, TAU);
  context.fill();
}

export { fillCircle, fillEllipse };

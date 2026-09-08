import { TAG_PLAYER, TAG_PUCK } from './tags.js';

const keys = new Set();
const TAU = Math.PI * 2;

addEventListener('keydown', ({ code }) => keys.add(code));
addEventListener('keyup', ({ code }) => keys.delete(code));

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

function fillShape(context, color, trace) {
  context.fillStyle = color;
  context.beginPath();
  trace();
  context.closePath();
  context.fill();
}

function zPosition(angle, centerX, centerY, offset) {
  const cameraFacing = Math.cos(angle) * Math.sign(offset);
  const depthAdjustedOffset = offset * (1 - cameraFacing * 0.2);
  return [
    centerX + Math.sin(angle) * depthAdjustedOffset,
    centerY + Math.cos(angle) * depthAdjustedOffset * 0.35,
  ];
}

function earFacesCamera(angle, offset) {
  return -Math.sin(angle) + Math.sign(offset) * Math.cos(angle) >= 0;
}

function fillEar(context, centerX, baseY, halfWidth, height, color) {
  const tipY = baseY - height;
  const turn = height * 0.22;

  fillShape(context, color, () => {
    context.moveTo(centerX - halfWidth, baseY);
    context.bezierCurveTo(
      centerX - halfWidth, baseY - height * 0.42,
      centerX - turn, tipY + turn,
      centerX, tipY,
    );
    context.bezierCurveTo(
      centerX + turn, tipY + turn,
      centerX + halfWidth, baseY - height * 0.42,
      centerX + halfWidth, baseY,
    );
    context.quadraticCurveTo(
      centerX, baseY + 2,
      centerX - halfWidth, baseY,
    );
  });
}

function traceHorn(context, halfWidth, length) {
  context.moveTo(-halfWidth, 0);
  context.arc(
    0,
    -halfWidth,
    halfWidth * Math.SQRT2,
    Math.PI * 0.75,
    Math.PI * 0.25,
    true,
  );
  context.lineTo(0, -length);
}

function renderHorn(context, angle, headX, headY) {
  const baseX = headX + Math.cos(angle) * 8;
  const baseY = headY - 13 - Math.sin(angle) * 6;
  const dx = Math.cos(angle) * 14;
  const dy = -20 - Math.sin(angle) * 4;
  const length = Math.hypot(dx, dy);
  const halfWidth = 4;

  context.save();
  context.translate(baseX, baseY);
  context.rotate(Math.atan2(dx, -dy));
  context.scale(2, 2);
  fillShape(context, '#ec6', () => traceHorn(context, halfWidth, length));

  context.beginPath();
  traceHorn(context, halfWidth, length);
  context.closePath();
  context.clip();

  for (let y = -4; y > -length; y -= 8) {
    fillShape(context, '#c94', () => {
      context.moveTo(-halfWidth, y);
      context.lineTo(halfWidth, y - 4);
      context.lineTo(halfWidth, y - 1);
      context.lineTo(-halfWidth, y + 3);
    });
  }
  context.restore();
}

function renderEar(context, angle, headX, headY, offset) {
  const facesCamera = earFacesCamera(angle, offset);
  const [centerX, baseY] = zPosition(
    angle,
    headX - Math.cos(angle) * 5,
    headY - 11 + Math.sin(angle) * 5,
    offset,
  );

  fillEar(
    context,
    centerX,
    facesCamera ? baseY + 3 : baseY,
    8,
    facesCamera ? 27 : 24,
    facesCamera ? '#fff' : '#cce',
  );

  if (facesCamera) {
    fillEar(context, centerX, baseY - 3, 4.5, 15, '#cce');
  }
}

function renderEars(context, angle, headX, headY, foreground) {
  const spacing = 10;
  [-spacing, spacing].forEach((offset) => {
    if (earFacesCamera(angle, offset) === foreground) {
      renderEar(context, angle, headX, headY, offset);
    }
  });
}

function renderConnector(context, headX, headY, headRadius, snoutX, snoutY, snoutRadius) {
  const dx = snoutX - headX;
  const dy = snoutY - headY;
  const distance = Math.hypot(dx, dy);
  const ux = dx / distance;
  const uy = dy / distance;
  const along = (headRadius - snoutRadius) / distance;
  const across = Math.sqrt(1 - along * along);
  const topX = ux * along + uy * across;
  const topY = uy * along - ux * across;
  const bottomX = ux * along - uy * across;
  const bottomY = uy * along + ux * across;

  fillShape(context, '#fff', () => {
    context.moveTo(headX + topX * headRadius, headY + topY * headRadius);
    context.lineTo(snoutX + topX * snoutRadius, snoutY + topY * snoutRadius);
    context.lineTo(snoutX + bottomX * snoutRadius, snoutY + bottomY * snoutRadius);
    context.lineTo(headX + bottomX * headRadius, headY + bottomY * headRadius);
  });
}

function renderEyes(context, angle, headX, headY) {
  const lookingForward = -Math.sin(angle) >= Math.cos(Math.PI / 8);
  const sides = lookingForward
    ? [-13, 13]
    : [Math.cos(angle) >= 0 ? 13 : -13];
  const eyePlaneX = headX + Math.cos(angle);
  const eyePlaneY = headY - Math.sin(angle) - 2;

  sides.forEach((side) => {
    const [eyeX, eyeY] = zPosition(angle, eyePlaneX, eyePlaneY, side);
    fillCircle(context, eyeX, eyeY, 6, '#111');
    fillCircle(context, eyeX + 2, eyeY - 2, 2, '#fff');
  });
}

function renderNostrils(context, angle, snoutX, snoutY) {
  if (Math.sin(angle) > 0) return;

  const nostrilX = snoutX + Math.cos(angle) * 6;
  const nostrilY = snoutY - Math.sin(angle) * 6;
  const gap = 8;
  fillCircle(context, nostrilX - gap / 2, nostrilY, 2.5, '#999');
  fillCircle(context, nostrilX + gap / 2, nostrilY, 2.5, '#999');
}

function renderTail(context, player, angle, anim) {
  const depth = Math.sin(angle);
  const front = depth * depth;
  const side = 1 - front;
  const horizontal = Math.cos(angle);
  const depthY = depth * 5;
  const point = (sideX, sideY, frontX, frontY) => [
    player.x + sideX * horizontal + frontX * front,
    player.y + sideY * side + frontY * front + depthY - Math.sin(anim * 12 + 0.8) * 3,
  ];

  const start = point(-28, -10, 0, 5);
  const topControlA = point(-68, -18, -18, 12);
  const topControlB = point(-35, 15, -15, 42);
  const tip = point(-68, 20 + Math.sin(anim * 12 + 1.2) * 2, 0, 60);
  const bottomControlA = point(-22, 35, 15, 42);
  const bottomControlB = point(-52, 15, 18, 12);
  const end = point(-28, 8, 0, 5);

  fillShape(context, '#aac', () => {
    context.moveTo(...start);
    context.bezierCurveTo(...topControlA, ...topControlB, ...tip);
    context.bezierCurveTo(...bottomControlA, ...bottomControlB, ...start);
  });
}

function renderTorso(context, player, anim) {
  const heightScale = 0.95 + Math.sin(anim * 12 + 0.4) * 0.05;
  const radiusY = 38 * heightScale;
  fillEllipse(context, player.x, player.y + 38 - radiusY, 38, radiusY, '#cce');
}

function renderHead(context, angle, headX, headY, snoutX, snoutY) {
  const headRadius = 22;
  const snoutRadius = 13;
  const facesCamera = Math.sin(angle) <= 0;

  if (!facesCamera) renderHorn(context, angle, headX, headY);
  renderConnector(context, headX, headY, headRadius, snoutX, snoutY, snoutRadius);
  renderEars(context, angle, headX, headY, false);
  fillCircle(context, headX, headY, headRadius, '#fff');
  fillCircle(context, snoutX, snoutY, snoutRadius, '#fff');
  renderEyes(context, angle, headX, headY);
  renderNostrils(context, angle, snoutX, snoutY);
  renderEars(context, angle, headX, headY, true);
  if (facesCamera) renderHorn(context, angle, headX, headY);
}

function renderPlayer(context, player, anim) {
  const angle = player.angle;
  const headX = player.x + Math.cos(angle) * 21;
  const headY = player.y - 14 - Math.sin(angle) * 5
    + (1 - Math.sin(anim * 12)) * 3;
  const snoutX = headX + Math.cos(angle) * 23;
  const snoutY = headY + 8 - Math.sin(angle) * 14
    + (1 - Math.sin(anim * 12 - 0.9));
  const tailInFront = Math.sin(angle) > 0;

  if (!tailInFront) renderTail(context, player, angle, anim);
  if (Math.sin(angle) > 0) {
    renderHead(context, angle, headX, headY, snoutX, snoutY);
    renderTorso(context, player, anim);
  } else {
    renderTorso(context, player, anim);
    renderHead(context, angle, headX, headY, snoutX, snoutY);
  }
  if (tailInFront) renderTail(context, player, angle, anim);
}

function PlayerCharacter(x = 0, y = 0, angle = 0) {
  let anim = 0;

  return {
    x,
    y,
    angle,
    tags: [TAG_PLAYER, TAG_PUCK],

    update(dt) {
      anim += dt;
      this.angle += (
        (keys.has('ArrowLeft') ? 1 : 0) -
        (keys.has('ArrowRight') ? 1 : 0)
      ) * 3 * dt;
    },

    render(context) {
      renderPlayer(context, this, anim);
    },
  };
}

export default PlayerCharacter;

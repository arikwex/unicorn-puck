const SHIELD_COLOR = '#4af';

// Shared by the pickup and the single protective bubble around the player.
function renderBubbleShield(context, x, y, radius) {
  context.save();
  const alpha = context.globalAlpha;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = SHIELD_COLOR;
  context.globalAlpha = alpha * 0.18;
  context.fill();
  context.strokeStyle = '#6cf';
  context.globalAlpha = alpha * 0.8;
  context.lineWidth = 3;
  context.stroke();
  context.beginPath();
  context.arc(x, y, radius * 0.82, Math.PI * 1.08, Math.PI * 1.4);
  context.strokeStyle = '#eff';
  context.globalAlpha = alpha * 0.85;
  context.lineCap = 'round';
  context.stroke();
  context.restore();
}

export { renderBubbleShield, SHIELD_COLOR };

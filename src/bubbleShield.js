const SHIELD_COLOR = '#49a8ff';

// Shared by the pickup and the single protective bubble around the player.
function renderBubbleShield(context, x, y, radius) {
  context.save();
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = 'rgba(73, 168, 255, 0.18)';
  context.fill();
  context.strokeStyle = 'rgba(110, 200, 255, 0.8)';
  context.lineWidth = 3;
  context.stroke();
  context.beginPath();
  context.arc(x, y, radius * 0.82, Math.PI * 1.08, Math.PI * 1.4);
  context.strokeStyle = 'rgba(230, 249, 255, 0.85)';
  context.lineCap = 'round';
  context.stroke();
  context.restore();
}

export { renderBubbleShield, SHIELD_COLOR };

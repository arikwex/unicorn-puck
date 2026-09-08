import { TAG_PLAYER, TAG_PUCK } from './tags.js';

function PlayerCharacter(x = 0, y = 0) {
  return {
    x,
    y,
    tags: [TAG_PLAYER, TAG_PUCK],

    update() {
      // Player controls will go here.
    },

    render(context) {
      context.fillStyle = 'rgb(210,210,230)'; 
      context.beginPath();
      context.arc(this.x, this.y, 38, 0, Math.PI * 2);
      context.fill();

      let headCenterX = this.x + 21;
      let headCenterY = this.y - 14;
      let headRadius = 22;
      let snoutCenterX = headCenterX + 23;
      let snoutCenterY = this.y - 6;
      let snoutRadius = 13;

      // Find the two common external tangents of the head and snout circles.
      const dx = snoutCenterX - headCenterX;
      const dy = snoutCenterY - headCenterY;
      const distance = Math.hypot(dx, dy);
      const ux = dx / distance;
      const uy = dy / distance;
      const along = (headRadius - snoutRadius) / distance;
      const across = Math.sqrt(1 - along * along);
      const topX = ux * along + uy * across;
      const topY = uy * along - ux * across;
      const bottomX = ux * along - uy * across;
      const bottomY = uy * along + ux * across;

      // Draw the tangent connector first so the circles cover any antialias seams.
      context.fillStyle = '#fff';
      context.beginPath();
      context.moveTo(headCenterX + topX * headRadius, headCenterY + topY * headRadius);
      context.lineTo(snoutCenterX + topX * snoutRadius, snoutCenterY + topY * snoutRadius);
      context.lineTo(snoutCenterX + bottomX * snoutRadius, snoutCenterY + bottomY * snoutRadius);
      context.lineTo(headCenterX + bottomX * headRadius, headCenterY + bottomY * headRadius);
      context.closePath();
      context.fill();

      // Placing the head and snout on the right establishes the facing direction.
      context.beginPath();
      context.arc(headCenterX, headCenterY, headRadius, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(snoutCenterX, snoutCenterY, snoutRadius, 0, Math.PI * 2);
      context.fill();
    },
  };
}

export default PlayerCharacter;

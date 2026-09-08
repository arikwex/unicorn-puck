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
      context.fillStyle = '#cce';
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

      function renderEar(angle, offset) {
        const facing = Math.cos(angle);
        const widthScale = 0.35 + Math.abs(facing) * 0.65;
        const earCenterX = headCenterX + offset;
        const earBaseY = headCenterY - 14;
        const earLean = Math.sin(angle) * 6;

        function earPath(halfWidth, height, lean) {
          const tipX = earCenterX + lean;
          const tipY = earBaseY - height;
          const turn = height * 0.22;

          context.beginPath();
          context.moveTo(earCenterX - halfWidth, earBaseY);
          context.bezierCurveTo(
            earCenterX - halfWidth, earBaseY - height * 0.42,
            tipX - turn, tipY + turn,
            tipX, tipY,
          );
          context.bezierCurveTo(
            tipX + turn, tipY + turn,
            earCenterX + halfWidth, earBaseY - height * 0.42,
            earCenterX + halfWidth, earBaseY,
          );
          context.closePath();
        }

        earPath(8 * widthScale, 27, earLean);
        context.fillStyle = facing >= 0 ? '#fff' : '#cce';
        context.fill();

        if (facing >= 0) {
          earPath(4.5 * widthScale, 18, earLean * 0.7);
          context.fillStyle = '#cce';
          context.fill();
        }
      }

      // Draw the tangent connector first so the circles cover any antialias seams.
      context.fillStyle = '#fff';
      context.beginPath();
      context.moveTo(headCenterX + topX * headRadius, headCenterY + topY * headRadius);
      context.lineTo(snoutCenterX + topX * snoutRadius, snoutCenterY + topY * snoutRadius);
      context.lineTo(snoutCenterX + bottomX * snoutRadius, snoutCenterY + bottomY * snoutRadius);
      context.lineTo(headCenterX + bottomX * headRadius, headCenterY + bottomY * headRadius);
      context.closePath();
      context.fill();

      // Paint the rear ear first so the front ear owns their overlap.
      renderEar(Math.PI, 6);
      renderEar(0, -6);

      // Placing the head and snout on the right establishes the facing direction.
      context.fillStyle = '#fff';
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

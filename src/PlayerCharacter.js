import { TAG_PLAYER, TAG_PUCK } from './tags.js';

const keys = new Set();
addEventListener('keydown', ({ code }) => keys.add(code));
addEventListener('keyup', ({ code }) => keys.delete(code));

function PlayerCharacter(x = 0, y = 0, angle = 0) {
  return {
    x,
    y,
    angle,
    tags: [TAG_PLAYER, TAG_PUCK],

    update(dt) {
      this.angle += (
        (keys.has('ArrowLeft') ? 1 : 0) -
        (keys.has('ArrowRight') ? 1 : 0)
      ) * 3 * dt;
    },

    render(context) {
      const playerAngle = this.angle;
      const headCenterX = this.x + Math.cos(playerAngle) * 21;
      const headCenterY = this.y - 14 - Math.sin(playerAngle) * 5;
      const headRadius = 22;
      const snoutCenterX = headCenterX + Math.cos(playerAngle) * 23;
      const snoutCenterY = headCenterY + 8
        - Math.sin(playerAngle) * 14;
      const snoutRadius = 13;

      function renderTorso() {
        context.fillStyle = '#cce';
        context.beginPath();
        context.arc(this.x, this.y, 38, 0, Math.PI * 2);
        context.fill();
      }

      function renderHead() {
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

        function zPosition(centerX, centerY, offset) {
          const cameraFacing = Math.cos(playerAngle) * Math.sign(offset);
          const depthAdjustedOffset = offset * (1 - cameraFacing * 0.2);
          return [
            centerX + Math.sin(playerAngle) * depthAdjustedOffset,
            centerY + Math.cos(playerAngle) * depthAdjustedOffset * 0.35,
          ];
        }

        function earFacesCamera(angle, offset) {
          return -Math.sin(angle) + Math.sign(offset) * Math.cos(angle) >= 0;
        }

        function renderEar(angle, offset) {
          const facesCamera = earFacesCamera(angle, offset);
          const [earCenterX, earBaseY] = zPosition(
            headCenterX,
            headCenterY - 11,
            offset,
          );

          function earPath(halfWidth, height, baseY = earBaseY) {
            const tipX = earCenterX;
            const tipY = baseY - height;
            const turn = height * 0.22;

            context.beginPath();
            context.moveTo(earCenterX - halfWidth, baseY);
            context.bezierCurveTo(
              earCenterX - halfWidth, baseY - height * 0.42,
              tipX - turn, tipY + turn,
              tipX, tipY,
            );
            context.bezierCurveTo(
              tipX + turn, tipY + turn,
              earCenterX + halfWidth, baseY - height * 0.42,
              earCenterX + halfWidth, baseY,
            );
            context.quadraticCurveTo(
              earCenterX, baseY + 2,
              earCenterX - halfWidth, baseY,
            );
            context.closePath();
          }

          earPath(8, 24);
          context.fillStyle = facesCamera ? '#fff' : '#cce';
          context.fill();

          if (facesCamera) {
            earPath(4.5, 15, earBaseY - 3);
            context.fillStyle = '#cce';
            context.fill();
          }
        }

        // Draw the tangent connector first so the circles cover antialias seams.
        context.fillStyle = '#fff';
        context.beginPath();
        context.moveTo(headCenterX + topX * headRadius, headCenterY + topY * headRadius);
        context.lineTo(snoutCenterX + topX * snoutRadius, snoutCenterY + topY * snoutRadius);
        context.lineTo(snoutCenterX + bottomX * snoutRadius, snoutCenterY + bottomY * snoutRadius);
        context.lineTo(headCenterX + bottomX * headRadius, headCenterY + bottomY * headRadius);
        context.closePath();
        context.fill();

        const leftEarAngle = playerAngle;
        const rightEarAngle = playerAngle;
        const earSpacing = 10;

        // Rear-facing ears sit behind the head circles.
        if (!earFacesCamera(leftEarAngle, -earSpacing)) {
          renderEar(leftEarAngle, -earSpacing);
        }
        if (!earFacesCamera(rightEarAngle, earSpacing)) {
          renderEar(rightEarAngle, earSpacing);
        }

        context.fillStyle = '#fff';
        context.beginPath();
        context.arc(headCenterX, headCenterY, headRadius, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.arc(snoutCenterX, snoutCenterY, snoutRadius, 0, Math.PI * 2);
        context.fill();

        const lookingForward = -Math.sin(playerAngle) >= Math.cos(Math.PI / 8);
        const eyeSides = lookingForward
          ? [-13, 13]
          : [Math.cos(playerAngle) >= 0 ? 13 : -13];
        const eyePlaneX = headCenterX + Math.cos(playerAngle);
        const eyePlaneY = headCenterY - Math.sin(playerAngle) - 2;

        context.fillStyle = '#111';
        eyeSides.forEach((side) => {
          const [eyeX, eyeY] = zPosition(
            eyePlaneX,
            eyePlaneY,
            side,
          );
          context.beginPath();
          context.arc(eyeX, eyeY, 6, 0, Math.PI * 2);
          context.fill();
        });

        // Both nostrils disappear together once the snout crosses its horizon.
        if (Math.sin(playerAngle - Math.PI / 10) <= 0) {
          const nostrilX = snoutCenterX + Math.cos(playerAngle) * 6;
          const nostrilY = snoutCenterY - Math.sin(playerAngle) * 6;
          const nostrilGap = 8;
          context.fillStyle = '#999';
          [-0.5, 0.5].forEach((offset) => {
            context.beginPath();
            context.arc(
              nostrilX + offset * nostrilGap,
              nostrilY,
              2.5,
              0,
              Math.PI * 2,
            );
            context.fill();
          });
        }

        // Camera-facing ears always sit on top of the head circles.
        if (earFacesCamera(leftEarAngle, -earSpacing)) {
          renderEar(leftEarAngle, -earSpacing);
        }
        if (earFacesCamera(rightEarAngle, earSpacing)) {
          renderEar(rightEarAngle, earSpacing);
        }
      }

      // Positive angles turn into the page; beyond this horizon the torso occludes the head.
      if (Math.sin(playerAngle - Math.PI / 10) > 0) {
        renderHead();
        renderTorso.call(this);
      } else {
        renderTorso.call(this);
        renderHead();
      }
    },
  };
}

export default PlayerCharacter;

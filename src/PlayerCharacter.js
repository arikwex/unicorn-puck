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

      // Placing the head on the right establishes the character's facing.
      context.fillStyle = '#fff';
      context.beginPath();
      context.arc(headCenterX, this.y - 14, 20, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(headCenterX + 23, this.y - 8, 12, 0, Math.PI * 2);
      context.fill();
      // Draw a filled trapezoid to fill out the head.
      context.fillStyle = '#f00';
      context.beginPath();
      context.moveTo(headCenterX, this.y - 14 - 20);
      context.lineTo(headCenterX + 23, this.y - 8 - 12);
      context.lineTo(headCenterX + 23, this.y - 8 + 12);
      context.lineTo(headCenterX, this.y - 14 + 20);
      context.closePath();
      context.fill();
    },
  };
}

export default PlayerCharacter;

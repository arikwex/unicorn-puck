import { getObjectsByTag } from './engine.js';
import {
  applyDamping,
  circleBoxContact,
  circleCircleContact,
  integratePuck,
  resolveCollision,
} from './physics.js';
import { TAG_OBSTACLE, TAG_PUCK } from './tags.js';

// Orchestrates every puck-like object: damps and integrates motion, then
// resolves puck-vs-puck and puck-vs-obstacle collisions using the shared
// helpers in physics.js. Runs after per-object update logic (input, AI)
// so a fresh impulse this frame is picked up immediately.
function PhysicsWorld() {
  return {
    order: 10,

    update(dt) {
      const pucks = getObjectsByTag(TAG_PUCK).map((object) => object.puck());
      const obstacles = getObjectsByTag(TAG_OBSTACLE).map((object) => object.puck());

      pucks.forEach((puck) => {
        applyDamping(puck, dt);
        integratePuck(puck, dt);
      });

      for (let i = 0; i < pucks.length; i++) {
        for (let j = i + 1; j < pucks.length; j++) {
          const contact = circleCircleContact(pucks[i], pucks[j]);
          if (contact) resolveCollision(pucks[i], pucks[j], contact.nx, contact.ny, contact.penetration);
        }
        obstacles.forEach((obstacle) => {
          const contact = circleBoxContact(pucks[i], obstacle);
          if (contact) resolveCollision(pucks[i], obstacle, contact.nx, contact.ny, contact.penetration);
        });
      }
    },
  };
}

export default PhysicsWorld;

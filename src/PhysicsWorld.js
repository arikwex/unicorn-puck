import { getObjectsByTag, remove } from './engine.js';
import {
  applyCollisionResponse,
  applyDamping,
  circleBoxContact,
  circleCircleContact,
  collisionResponses,
  integratePuck,
} from './physics.js';
import { TAG_OBSTACLE, TAG_PUCK } from './tags.js';

// Runs in the engine's dedicated physics phase after every ordinary update.
// Capture all contacts before dispatching any reactions, so a bounce or
// removal cannot hide a collision from the other participant.
function PhysicsWorld() {
  return {
    physicsUpdate(dt) {
      const pucks = getObjectsByTag(TAG_PUCK);
      const puckSet = new Set(pucks);
      const obstacles = getObjectsByTag(TAG_OBSTACLE).filter((object) => !puckSet.has(object));

      pucks.forEach((object) => {
        const puck = object.puck();
        applyDamping(puck, dt);
        integratePuck(puck, dt);
      });

      const bodies = new Map([...pucks, ...obstacles].map((object) => [object, { ...object.puck() }]));
      const contacts = [];
      function detect(a, b) {
        const bodyA = bodies.get(a);
        const bodyB = bodies.get(b);
        const contact = bodyB.shape === 'box'
          ? circleBoxContact(bodyA, bodyB)
          : circleCircleContact(bodyA, bodyB);
        if (contact) contacts.push([a, b, contact]);
      }

      for (let i = 0; i < pucks.length; i++) {
        for (let j = i + 1; j < pucks.length; j++) detect(pucks[i], pucks[j]);
        obstacles.forEach((obstacle) => detect(pucks[i], obstacle));
      }

      // Resolve on working copies so simultaneous contacts share the
      // accumulated bounce/correction instead of applying the same impulse
      // twice at a wall seam. Impact snapshots stay intact for callbacks.
      const resolved = new Map([...bodies].map(([object, body]) => [object, { ...body }]));
      const collisions = [];
      contacts.forEach(([a, b, contact]) => {
        const bodyA = bodies.get(a);
        const bodyB = bodies.get(b);
        const resolvedA = resolved.get(a);
        const resolvedB = resolved.get(b);
        const separation = (resolvedB.x - bodyB.x - resolvedA.x + bodyA.x) * contact.nx
          + (resolvedB.y - bodyB.y - resolvedA.y + bodyA.y) * contact.ny;
        const penetration = Math.max(0, contact.penetration - separation);
        const [responseA, responseB] = collisionResponses(resolvedA, resolvedB, contact.nx, contact.ny, penetration);
        applyCollisionResponse(resolvedA, responseA);
        applyCollisionResponse(resolvedB, responseB);
        // Each recipient's normal points toward the other body; otherBody
        // is a snapshot, so impact velocity survives the other callback.
        collisions.push([a, b, { ...contact, otherBody: bodyB, response: responseA }]);
        collisions.push([b, a, {
          nx: -contact.nx, ny: -contact.ny, penetration: contact.penetration,
          otherBody: bodyA, response: responseB,
        }]);
      });

      // Returning true from onCollision removes the object after both
      // participants have received their reactions, just like update().
      const expired = new Set();
      collisions.forEach(([object, other, collision]) => {
        if (object.onCollision) {
          if (object.onCollision(other, collision)) expired.add(object);
        } else {
          applyCollisionResponse(object.puck(), collision.response);
        }
      });
      pucks.forEach((object) => { object.order = object.puck().y; });
      if (expired.size) remove([...expired]);
    },
  };
}

export default PhysicsWorld;

import { getObjectsByTag, remove } from './engine.js';
import {
  applyCollisionResponse,
  applyDamping,
  circleBoxContact,
  circleCircleContact,
  collisionResponses,
  integratePuck,
} from './physics.js';
import { TAG_ENEMY, TAG_OBSTACLE, TAG_PLAYER, TAG_PROJECTILE, TAG_PUCK } from './tags.js';

// Runs in the engine's dedicated physics phase after every ordinary update.
// Capture all contacts before dispatching any reactions, so a bounce or
// removal cannot hide a collision from the other participant.
function PhysicsWorld() {
  return {
    physicsUpdate(dt) {
      const pucks = getObjectsByTag(TAG_PUCK);
      const puckSet = new Set(pucks);
      const obstacles = getObjectsByTag(TAG_OBSTACLE).filter((object) => !puckSet.has(object));
      const projectiles = getObjectsByTag(TAG_PROJECTILE);
      const participants = [...pucks, ...obstacles, ...projectiles];

      pucks.forEach((object) => {
        const puck = object.puck();
        applyDamping(puck, dt);
        integratePuck(puck, dt);
      });
      projectiles.forEach((projectile) => {
        projectile.x += projectile.vx * dt;
        projectile.y += projectile.vy * dt;
        projectile.order = projectile.y;
      });

      const bodies = new Map(participants.map((object) => [object, { ...object.puck() }]));
      const contacts = [];
      function contactBetween(a, b) {
        const bodyA = bodies.get(a);
        const bodyB = bodies.get(b);
        return bodyB.box
          ? circleBoxContact(bodyA, bodyB)
          : circleCircleContact(bodyA, bodyB);
      }
      function detect(a, b) {
        const contact = contactBetween(a, b);
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
        queue(a, b, contact, responseA, responseB);
      });

      // Both callbacks see the captured impact state, even if the first
      // callback bounces or removes a participant.
      function queue(a, b, contact, responseA, responseB) {
        collisions.push([a, b, { ...contact, otherBody: bodies.get(b), response: responseA }]);
        collisions.push([b, a, {
          nx: -contact.nx, ny: -contact.ny, penetration: contact.penetration,
          otherBody: bodies.get(a), response: responseB,
        }]);
      }

      // Shots use the same overlaps as pucks, ignore enemies and hit once.
      // Check obstacles before players so cover wins a simultaneous overlap.
      const shotTargets = [...obstacles, ...pucks].filter((object) =>
        !object.tags.includes(TAG_ENEMY)
        && (object.tags.includes(TAG_OBSTACLE) || object.tags.includes(TAG_PLAYER)));
      projectiles.forEach((projectile) => {
        for (const target of shotTargets) {
          const contact = contactBetween(projectile, target);
          if (!contact) continue;
          const response = { dx: 0, dy: 0, dvx: 0, dvy: 0, domega: 0 };
          queue(projectile, target, contact, response, response);
          break;
        }
      });

      projectiles.forEach((projectile) => projectile.afterPhysics?.());

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

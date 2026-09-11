import { getObjectsByTag, remove } from './engine.js';
import {
  applyCollisionResponse,
  applyDamping,
  circleBoxContact,
  circleCircleContact,
  collisionResponses,
  integratePuck,
  sweptCircleHitTime,
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
      const previousBodies = new Map(participants.map((object) => [object, { ...object.puck() }]));

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
      function detect(a, b) {
        const bodyA = bodies.get(a);
        const bodyB = bodies.get(b);
        let contact = bodyB.shape === 'box'
          ? circleBoxContact(bodyA, bodyB)
          : circleCircleContact(bodyA, bodyB);
        // Grates must hold even when chained launches cross their entire
        // thickness in a frame. Capture the entry face, not the far face.
        if (b.blocksSweptMotion) {
          const start = previousBodies.get(a);
          const time = sweptCircleHitTime(start, bodyA, bodyB);
          if (time > 0 && time <= 1) {
            const hit = { ...bodyA, x: start.x + (bodyA.x - start.x) * time,
              y: start.y + (bodyA.y - start.y) * time, radius: bodyA.radius + 0.001 };
            const swept = circleBoxContact(hit, bodyB);
            if (swept) contact = { ...swept, penetration: Math.max(0,
              (bodyA.x - hit.x) * swept.nx + (bodyA.y - hit.y) * swept.ny) };
          }
        }
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

      // Shots ignore enemies and stop at the first obstruction along their
      // path, including moving players. They notify both objects without
      // participating in the solid-body bounce solver.
      const shotTargets = [...obstacles, ...pucks].filter((object) =>
        !object.tags.includes(TAG_ENEMY)
        && (object.tags.includes(TAG_OBSTACLE) || object.tags.includes(TAG_PLAYER)));
      projectiles.forEach((projectile) => {
        const start = previousBodies.get(projectile);
        const end = bodies.get(projectile);
        let hit;
        let first = Infinity;
        shotTargets.forEach((target) => {
          const time = sweptCircleHitTime(start, end, bodies.get(target), previousBodies.get(target));
          if (time < first) { first = time; hit = target; }
        });
        if (!hit) return;
        projectile.x = start.x + (end.x - start.x) * first;
        projectile.y = start.y + (end.y - start.y) * first;
        const targetBody = bodies.get(hit);
        const speed = Math.hypot(end.vx, end.vy) || 1;
        const nx = end.vx / speed;
        const ny = end.vy / speed;
        const response = { dx: 0, dy: 0, dvx: 0, dvy: 0, domega: 0 };
        collisions.push([projectile, hit, { nx, ny, penetration: 0, otherBody: targetBody, response }]);
        collisions.push([hit, projectile, { nx: -nx, ny: -ny, penetration: 0, otherBody: end, response }]);
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

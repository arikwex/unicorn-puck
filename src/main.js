import Camera from './camera.js';
import { add, start } from './engine.js';
import PlayerCharacter from './PlayerCharacter.js';

add(PlayerCharacter());
add(Camera());
start();

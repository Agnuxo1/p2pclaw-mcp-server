import { db } from '../config/gun.js';
import { gunSafe } from '../utils/gunUtils.js';
import { createTauHeartbeat } from './tauHeartbeat.js';

const heartbeat = createTauHeartbeat({ db, encode: gunSafe, log: console.log });

export function initializeTauHeartbeat() {
    heartbeat.initialize();
}

export function getCurrentTau() {
    return heartbeat.getCurrentTau();
}

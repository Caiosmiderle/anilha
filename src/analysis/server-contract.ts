export { ANALYSIS_SYSTEM, analysisTool, parseReply, validContext } from './contract';
import { EXERCISES } from '../engine/exercises';
export const CATALOG_IDS = EXERCISES.map((e) => e.id);
export const CATALOG_NAMES = [...EXERCISES.map((e) => e.name), 'Exercício personalizado'];

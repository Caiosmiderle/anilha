import {
  Bike,
  Footprints,
  HeartPulse,
  Orbit,
  PersonStanding,
  Sailboat,
  TrendingUp,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import type { CardioKind } from '../engine/types';

export const CARDIO_ICON: Record<CardioKind, LucideIcon> = {
  corrida: Footprints,
  caminhada: PersonStanding,
  bike: Bike,
  eliptico: Orbit,
  natacao: Waves,
  remo: Sailboat,
  escada: TrendingUp,
  outro: HeartPulse,
};

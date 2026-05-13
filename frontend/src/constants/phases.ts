export interface PhaseInfo {
  id: string;
  name: string;
  shortName: string;
  canCastSorceries: boolean;
}

export const PHASES: PhaseInfo[] = [
  { id: 'upkeep', name: 'Upkeep',     shortName: 'Upkeep', canCastSorceries: false },
  { id: 'draw',   name: 'Draw Step',  shortName: 'Draw',   canCastSorceries: false },
  { id: 'main1', name: 'Main Phase 1', shortName: 'Main 1', canCastSorceries: true },
  { id: 'combat_begin', name: 'Beginning of Combat', shortName: 'Combat', canCastSorceries: false },
  { id: 'combat_attackers', name: 'Declare Attackers', shortName: 'Attackers', canCastSorceries: false },
  { id: 'combat_blockers', name: 'Declare Blockers', shortName: 'Blockers', canCastSorceries: false },
  { id: 'combat_damage', name: 'Combat Damage', shortName: 'Damage', canCastSorceries: false },
  { id: 'combat_end', name: 'End of Combat', shortName: 'End Combat', canCastSorceries: false },
  { id: 'main2', name: 'Main Phase 2', shortName: 'Main 2', canCastSorceries: true },
  { id: 'end', name: 'End Step', shortName: 'End', canCastSorceries: false },
];

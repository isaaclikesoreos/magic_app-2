import { describe, it, expect } from 'vitest';
import { applyBuffCreature, applyBuffSelf, applyProwessTrigger, applyGrantKeywordUntilEOT } from '../buff';
import { makeGameState, createCreature, createStackItem, mockHelpers } from '../../__tests__/fixtures';

describe('applyBuffCreature', () => {
  it('buffs target creature power and toughness', () => {
    const creature = createCreature({ card_id: 'bear-1', name: 'Grizzly Bears', power: '2', toughness: '2', owner: 'you' });
    const state = makeGameState({ battlefield: [creature] });
    const item = createStackItem({
      source: { card_id: 'rage-1', name: 'Monstrous Rage', owner: 'you' },
      effect: { type: 'buff_creature', power: 2, toughness: 0 },
      targeting_data: { targetType: 'creature', targetData: { card_id: 'bear-1', owner: 'you' } }
    });
    const helpers = mockHelpers();
    const result = applyBuffCreature(item, state, helpers);

    const buffed = result.players.you.battlefield[0];
    expect(buffed.buffPower).toBe(2);
    expect(buffed.buffToughness).toBe(0);
  });

  it('attaches role token to creature', () => {
    const creature = createCreature({ card_id: 'bear-2', name: 'Grizzly Bears', owner: 'you' });
    const state = makeGameState({ battlefield: [creature] });
    const item = createStackItem({
      source: { card_id: 'rage-2', name: 'Monstrous Rage', owner: 'you' },
      effect: { type: 'buff_creature', power: 2, toughness: 0, role: 'Monster', grantsTrample: true },
      targeting_data: { targetType: 'creature', targetData: { card_id: 'bear-2', owner: 'you' } }
    });
    const helpers = mockHelpers();
    const result = applyBuffCreature(item, state, helpers);

    const buffed = result.players.you.battlefield[0];
    expect(buffed.attachedRoles.length).toBe(1);
    expect(buffed.attachedRoles[0].type).toBe('Monster');
    expect(buffed.hasTrample).toBe(true);
  });

  it('replaces existing role of same type', () => {
    const creature = createCreature({
      card_id: 'bear-3',
      name: 'Grizzly Bears',
      owner: 'you',
      attachedRoles: [{ type: 'Monster', id: 'old-role', power: 1, toughness: 1 }]
    });
    const state = makeGameState({ battlefield: [creature] });
    const item = createStackItem({
      source: { card_id: 'rage-3', name: 'Monstrous Rage', owner: 'you' },
      effect: { type: 'buff_creature', power: 2, toughness: 0, role: 'Monster' },
      targeting_data: { targetType: 'creature', targetData: { card_id: 'bear-3', owner: 'you' } }
    });
    const helpers = mockHelpers();
    const result = applyBuffCreature(item, state, helpers);

    const buffed = result.players.you.battlefield[0];
    expect(buffed.attachedRoles.length).toBe(1);
    expect(buffed.attachedRoles[0].id).not.toBe('old-role');
    expect(result._leavingRoles.length).toBe(1);
  });

  it('grants trample from effect flag', () => {
    const creature = createCreature({ card_id: 'bear-4', name: 'Bear', owner: 'you' });
    const state = makeGameState({ battlefield: [creature] });
    const item = createStackItem({
      effect: { type: 'buff_creature', power: 3, toughness: 3, grantsTrample: true },
      targeting_data: { targetType: 'creature', targetData: { card_id: 'bear-4', owner: 'you' } }
    });
    const helpers = mockHelpers();
    const result = applyBuffCreature(item, state, helpers);

    expect(result.players.you.battlefield[0].hasTrample).toBe(true);
  });
});

describe('applyBuffSelf', () => {
  it('buffs the source permanent', () => {
    const fleshtaker = createCreature({ card_id: 'ft-1', name: 'Fleshtaker', power: '3', toughness: '3' });
    const state = makeGameState({ battlefield: [fleshtaker] });
    const item = createStackItem({
      source: { card_id: 'ft-1', name: 'Fleshtaker', owner: 'you' },
      effect: { type: 'buff_self', power: 1, toughness: 1 }
    });
    const helpers = mockHelpers();
    const result = applyBuffSelf(item, state, helpers);

    const buffed = result.players.you.battlefield[0];
    expect(buffed.buffPower).toBe(1);
    expect(buffed.buffToughness).toBe(1);
  });
});

describe('applyProwessTrigger', () => {
  it('adds prowessBonus to target creature', () => {
    const swiftspear = createCreature({ card_id: 'ms-1', name: 'Monastery Swiftspear' });
    const state = makeGameState({ battlefield: [swiftspear] });
    const item = createStackItem({
      source: { card_id: 'ms-1', name: 'Monastery Swiftspear', owner: 'you' },
      effect: { type: 'prowess_trigger', targetCardId: 'ms-1' }
    });
    const helpers = mockHelpers();
    const result = applyProwessTrigger(item, state, helpers);

    expect(result.players.you.battlefield[0].prowessBonus).toBe(1);
  });

  it('stacks prowess bonuses', () => {
    const swiftspear = createCreature({ card_id: 'ms-2', name: 'Monastery Swiftspear', prowessBonus: 1 });
    const state = makeGameState({ battlefield: [swiftspear] });
    const item = createStackItem({
      source: { card_id: 'ms-2', name: 'Monastery Swiftspear', owner: 'you' },
      effect: { type: 'prowess_trigger', targetCardId: 'ms-2' }
    });
    const helpers = mockHelpers();
    const result = applyProwessTrigger(item, state, helpers);

    expect(result.players.you.battlefield[0].prowessBonus).toBe(2);
  });
});

describe('applyGrantKeywordUntilEOT', () => {
  it('adds the keyword to source and tracks the grant', () => {
    const adanto = createCreature({
      card_id: 'adanto-1', instance_id: 'adanto-1', name: 'Adanto Vanguard', owner: 'you',
      keywords: [],
    });
    const state = makeGameState({ battlefield: [adanto] });
    const item = createStackItem({
      source: { card_id: 'adanto-1', instance_id: 'adanto-1', name: 'Adanto Vanguard', owner: 'you' },
      effect: { type: 'grant_keyword_until_eot', keyword: 'indestructible', target: 'self' }
    });
    const result = applyGrantKeywordUntilEOT(item, state, mockHelpers());
    const updated = result.players.you.battlefield[0];
    expect(updated.keywords).toContain('indestructible');
    expect(updated._grantedKeywordsEOT).toContain('indestructible');
  });

  it('does not duplicate keyword if already present, but still tracks the grant for cleanup', () => {
    const slick = createCreature({
      card_id: 'slick-1', instance_id: 'slick-1', name: 'Slickshot Show-Off', owner: 'you',
      keywords: ['flying'],
    });
    const state = makeGameState({ battlefield: [slick] });
    const item = createStackItem({
      source: { card_id: 'slick-1', instance_id: 'slick-1', name: 'Slickshot', owner: 'you' },
      effect: { type: 'grant_keyword_until_eot', keyword: 'flying', target: 'self' }
    });
    const result = applyGrantKeywordUntilEOT(item, state, mockHelpers());
    const updated = result.players.you.battlefield[0];
    expect(updated.keywords.filter(k => k === 'flying').length).toBe(1);
    expect(updated._grantedKeywordsEOT).toContain('flying');
  });

  it('no-op when source not on battlefield', () => {
    const state = makeGameState();
    const item = createStackItem({
      source: { card_id: 'ghost-1', instance_id: 'ghost-1', name: 'Ghost', owner: 'you' },
      effect: { type: 'grant_keyword_until_eot', keyword: 'indestructible', target: 'self' }
    });
    const result = applyGrantKeywordUntilEOT(item, state, mockHelpers());
    expect(result.players.you.battlefield.length).toBe(0);
  });
});

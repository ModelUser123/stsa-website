/**
 * tests/meal-cards.test.js
 * TDD tests for meal card generation logic.
 * Tests admin/meal-cards.js — pure functions, no DOM, no network.
 *
 * Requirements (per Earl Harper's ask):
 *   - Every registered attendee gets a card (paid, pending, walk-ins alike)
 *   - Color mapping is database-driven (not hardcoded meal names)
 *   - Meal 1 = Red (#DC2626), Meal 2 = Green (#16A34A), Meal 3 = Blue (#2563EB)
 *   - 6 cards per page (2 columns × 3 rows) for US Letter paper
 *   - Cards sorted alphabetically by name by default
 *   - Each card has: name, mealText, colorHex, colorName, eventName, eventDate
 *   - Empty registrations returns empty / "no registrations" message
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const req = createRequire(import.meta.url);
const {
  MEAL_COLORS,
  getMealColorMap,
  generateCards,
  paginateCards,
  buildSummary,
  CARDS_PER_PAGE,
} = req('../admin/meal-cards.js');

// ─── Test fixtures ────────────────────────────────────────────────────────────

const ACTIVE_EVENT = {
  id: 'evt-001',
  event_name: 'May Luncheon',
  event_date: '2026-05-14',
  meal_choice_1: 'NY Strip Steak',
  meal_choice_2: 'Grilled Chicken Breast',
  meal_choice_3: 'Pan-Seared Salmon',
};

const REGISTRATIONS = [
  { id: 'r1', name: 'Zelda Martinez', meal_choice: 'NY Strip Steak',         payment_status: 'paid',    is_walkin: false, created_at: '2026-04-01T10:00:00Z' },
  { id: 'r2', name: 'Aaron Smith',    meal_choice: 'Grilled Chicken Breast',  payment_status: 'pending', is_walkin: false, created_at: '2026-04-02T10:00:00Z' },
  { id: 'r3', name: 'Maria Johnson',  meal_choice: 'Pan-Seared Salmon',       payment_status: 'paid',    is_walkin: true,  created_at: '2026-04-03T10:00:00Z' },
  { id: 'r4', name: 'Bob Cooper',     meal_choice: 'NY Strip Steak',          payment_status: 'pending', is_walkin: true,  created_at: '2026-04-04T10:00:00Z' },
];

// ═══════════════════════════════════════════════════════════════════════════
// COLOR CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════
describe('MEAL_COLORS constants', () => {
  it('has exactly 3 color entries', () => {
    expect(MEAL_COLORS.length).toBe(3);
  });

  it('Meal 1 color is Red (#DC2626)', () => {
    expect(MEAL_COLORS[0].hex).toBe('#DC2626');
    expect(MEAL_COLORS[0].name).toBe('Red');
  });

  it('Meal 2 color is Green (#16A34A)', () => {
    expect(MEAL_COLORS[1].hex).toBe('#16A34A');
    expect(MEAL_COLORS[1].name).toBe('Green');
  });

  it('Meal 3 color is Blue (#2563EB)', () => {
    expect(MEAL_COLORS[2].hex).toBe('#2563EB');
    expect(MEAL_COLORS[2].name).toBe('Blue');
  });

  it('all color hex values start with # and are 7 chars', () => {
    MEAL_COLORS.forEach(c => {
      expect(c.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COLOR MAPPING — dynamic (database-driven, NOT hardcoded meal names)
// ═══════════════════════════════════════════════════════════════════════════
describe('getMealColorMap — dynamic, database-driven', () => {
  it('maps meal_choice_1 to Red (#DC2626)', () => {
    const map = getMealColorMap(ACTIVE_EVENT);
    expect(map['NY Strip Steak'].hex).toBe('#DC2626');
    expect(map['NY Strip Steak'].name).toBe('Red');
  });

  it('maps meal_choice_2 to Green (#16A34A)', () => {
    const map = getMealColorMap(ACTIVE_EVENT);
    expect(map['Grilled Chicken Breast'].hex).toBe('#16A34A');
    expect(map['Grilled Chicken Breast'].name).toBe('Green');
  });

  it('maps meal_choice_3 to Blue (#2563EB)', () => {
    const map = getMealColorMap(ACTIVE_EVENT);
    expect(map['Pan-Seared Salmon'].hex).toBe('#2563EB');
    expect(map['Pan-Seared Salmon'].name).toBe('Blue');
  });

  it('works with completely different meal names (color is positional, not food-specific)', () => {
    const differentEvent = {
      meal_choice_1: 'Veggie Burger',
      meal_choice_2: 'Fish Tacos',
      meal_choice_3: 'Pasta Primavera',
    };
    const map = getMealColorMap(differentEvent);
    expect(map['Veggie Burger'].hex).toBe('#DC2626');   // still Red — positional
    expect(map['Fish Tacos'].hex).toBe('#16A34A');       // still Green
    expect(map['Pasta Primavera'].hex).toBe('#2563EB'); // still Blue
  });

  it('maps change when event meal names change (truly database-driven)', () => {
    const event1 = { meal_choice_1: 'Steak', meal_choice_2: 'Chicken', meal_choice_3: 'Fish' };
    const event2 = { meal_choice_1: 'Tofu', meal_choice_2: 'Shrimp', meal_choice_3: 'Ribs' };
    const map1 = getMealColorMap(event1);
    const map2 = getMealColorMap(event2);
    expect(map1['Steak'].hex).toBe('#DC2626');
    expect(map2['Tofu'].hex).toBe('#DC2626');   // same position, different name
    expect(map1['Steak']).toEqual(map2['Tofu']); // positional, not name-based
  });

  it('returns empty map when event is null', () => {
    const map = getMealColorMap(null);
    expect(Object.keys(map).length).toBe(0);
  });

  it('returns empty map when event is undefined', () => {
    const map = getMealColorMap(undefined);
    expect(Object.keys(map).length).toBe(0);
  });

  it('handles event with only 2 meal choices (skips empty)', () => {
    const partialEvent = { meal_choice_1: 'Steak', meal_choice_2: 'Chicken', meal_choice_3: '' };
    const map = getMealColorMap(partialEvent);
    expect(map['Steak']).toBeDefined();
    expect(map['Chicken']).toBeDefined();
    expect(Object.keys(map).length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CARD GENERATION — data correctness
// ═══════════════════════════════════════════════════════════════════════════
describe('generateCards — data correctness', () => {
  it('generates one card for every registration in the list', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT);
    expect(cards.length).toBe(REGISTRATIONS.length);
  });

  it('includes PAID registrations', () => {
    const paid = REGISTRATIONS.filter(r => r.payment_status === 'paid');
    const cards = generateCards(paid, ACTIVE_EVENT);
    expect(cards.length).toBe(paid.length);
  });

  it('includes PENDING registrations (not just paid)', () => {
    const pending = REGISTRATIONS.filter(r => r.payment_status === 'pending');
    const cards = generateCards(pending, ACTIVE_EVENT);
    expect(cards.length).toBe(pending.length);
  });

  it('includes WALK-IN registrations regardless of payment status', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT);
    const names = cards.map(c => c.name);
    expect(names).toContain('Maria Johnson'); // walkin, paid
    expect(names).toContain('Bob Cooper');    // walkin, pending
  });

  it('includes every attendee regardless of payment_status', () => {
    // Mix of paid, pending, walk-in
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT);
    expect(cards.length).toBe(4); // all 4, no filtering
  });

  it('each card has all required fields: name, mealText, colorHex, colorName, eventName, eventDate', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT);
    cards.forEach(card => {
      expect(card).toHaveProperty('name');
      expect(card).toHaveProperty('mealText');
      expect(card).toHaveProperty('colorHex');
      expect(card).toHaveProperty('colorName');
      expect(card).toHaveProperty('eventName');
      expect(card).toHaveProperty('eventDate');
    });
  });

  it('card colorHex matches the correct meal position (Meal 1 = Red)', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT, 'date');
    const zelda = cards.find(c => c.name === 'Zelda Martinez');
    expect(zelda.mealText).toBe('NY Strip Steak');
    expect(zelda.colorHex).toBe('#DC2626'); // meal_choice_1 = Red
  });

  it('card colorHex matches the correct meal position (Meal 2 = Green)', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT, 'date');
    const aaron = cards.find(c => c.name === 'Aaron Smith');
    expect(aaron.mealText).toBe('Grilled Chicken Breast');
    expect(aaron.colorHex).toBe('#16A34A'); // meal_choice_2 = Green
  });

  it('card colorHex matches the correct meal position (Meal 3 = Blue)', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT, 'date');
    const maria = cards.find(c => c.name === 'Maria Johnson');
    expect(maria.mealText).toBe('Pan-Seared Salmon');
    expect(maria.colorHex).toBe('#2563EB'); // meal_choice_3 = Blue
  });

  it('card includes event name so loose cards can be identified', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT);
    cards.forEach(card => {
      expect(card.eventName).toBe('May Luncheon');
    });
  });

  it('card includes event date so loose cards can be identified', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT);
    cards.forEach(card => {
      expect(card.eventDate).toBe('2026-05-14');
    });
  });

  it('empty registrations array returns empty array', () => {
    const cards = generateCards([], ACTIVE_EVENT);
    expect(cards).toEqual([]);
  });

  it('null registrations returns empty array', () => {
    const cards = generateCards(null, ACTIVE_EVENT);
    expect(cards).toEqual([]);
  });

  it('undefined registrations returns empty array', () => {
    const cards = generateCards(undefined, ACTIVE_EVENT);
    expect(cards).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SORTING
// ═══════════════════════════════════════════════════════════════════════════
describe('generateCards — sorting', () => {
  it('sorts alphabetically by name by default', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT);
    const names = cards.map(c => c.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it('sortBy="name": Aaron Smith comes before Zelda Martinez', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT, 'name');
    const names = cards.map(c => c.name);
    expect(names[0]).toBe('Aaron Smith');
    expect(names[names.length - 1]).toBe('Zelda Martinez');
  });

  it('sortBy="name": Bob Cooper comes before Maria Johnson', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT, 'name');
    const names = cards.map(c => c.name);
    const bobIdx   = names.indexOf('Bob Cooper');
    const mariaIdx = names.indexOf('Maria Johnson');
    expect(bobIdx).toBeLessThan(mariaIdx);
  });

  it('sortBy="meal": cards grouped by meal choice alphabetically', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT, 'meal');
    // Grilled Chicken < NY Strip < Pan-Seared alphabetically
    expect(cards[0].mealText).toBe('Grilled Chicken Breast');
  });

  it('sortBy="meal": secondary sort by name within same meal', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT, 'meal');
    // Both Zelda Martinez and Bob Cooper chose NY Strip Steak
    // Bob < Zelda alphabetically, so Bob comes first within that meal group
    const nyStripCards = cards.filter(c => c.mealText === 'NY Strip Steak');
    expect(nyStripCards[0].name).toBe('Bob Cooper');
    expect(nyStripCards[1].name).toBe('Zelda Martinez');
  });

  it('sortBy="date": preserves insertion order (no alphabetical sort)', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT, 'date');
    // REGISTRATIONS is ordered r1→r4 by created_at
    expect(cards[0].name).toBe('Zelda Martinez'); // r1: earliest
    expect(cards[1].name).toBe('Aaron Smith');    // r2
    expect(cards[2].name).toBe('Maria Johnson');  // r3
    expect(cards[3].name).toBe('Bob Cooper');     // r4: latest
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LAYOUT — page grouping (6 cards per page)
// ═══════════════════════════════════════════════════════════════════════════
describe('paginateCards — layout grouping (2 cols × 3 rows = US Letter)', () => {
  it('CARDS_PER_PAGE constant is 6', () => {
    expect(CARDS_PER_PAGE).toBe(6);
  });

  it('2 columns × 3 rows = CARDS_PER_PAGE', () => {
    const COLS = 2;
    const ROWS = 3;
    expect(COLS * ROWS).toBe(CARDS_PER_PAGE);
  });

  it('0 cards = 0 pages', () => {
    expect(paginateCards([])).toHaveLength(0);
  });

  it('1 card = 1 page with 1 card', () => {
    const pages = paginateCards([{ name: 'Test' }]);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(1);
  });

  it('6 cards = exactly 1 full page', () => {
    const cards = Array(6).fill({ name: 'Test' });
    const pages = paginateCards(cards);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(6);
  });

  it('7 cards = 2 pages (6 + 1)', () => {
    const cards = Array(7).fill({ name: 'Test' });
    const pages = paginateCards(cards);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(6);
    expect(pages[1]).toHaveLength(1);
  });

  it('12 cards = 2 full pages', () => {
    const cards = Array(12).fill({ name: 'Test' });
    const pages = paginateCards(cards);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(6);
    expect(pages[1]).toHaveLength(6);
  });

  it('13 cards = 3 pages (6 + 6 + 1)', () => {
    const cards = Array(13).fill({ name: 'Test' });
    const pages = paginateCards(cards);
    expect(pages).toHaveLength(3);
    expect(pages[2]).toHaveLength(1);
  });

  it('page break occurs after every 6th card', () => {
    // 8 registrations → 2 pages → page-break after card #6
    const eightRegs = [
      ...REGISTRATIONS,
      { id: 'r5', name: 'Claire Adams',   meal_choice: 'NY Strip Steak',    payment_status: 'paid', is_walkin: false, created_at: '2026-04-05T10:00:00Z' },
      { id: 'r6', name: 'David Torres',   meal_choice: 'Grilled Chicken Breast', payment_status: 'paid', is_walkin: false, created_at: '2026-04-06T10:00:00Z' },
      { id: 'r7', name: 'Emily Chen',     meal_choice: 'Pan-Seared Salmon', payment_status: 'paid', is_walkin: false, created_at: '2026-04-07T10:00:00Z' },
      { id: 'r8', name: 'Frank Wilson',   meal_choice: 'NY Strip Steak',    payment_status: 'paid', is_walkin: false, created_at: '2026-04-08T10:00:00Z' },
    ];
    const cards = generateCards(eightRegs, ACTIVE_EVENT, 'name');
    const pages = paginateCards(cards);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(6); // page 1: 6 cards
    expect(pages[1]).toHaveLength(2); // page 2: 2 cards (overflow)
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY STRING
// ═══════════════════════════════════════════════════════════════════════════
describe('buildSummary', () => {
  it('returns "No registrations yet" message for empty cards', () => {
    const summary = buildSummary([], ACTIVE_EVENT);
    expect(summary).toMatch(/no registrations yet/i);
  });

  it('returns "No registrations yet" for null cards', () => {
    const summary = buildSummary(null, ACTIVE_EVENT);
    expect(summary).toMatch(/no registrations yet/i);
  });

  it('includes total card count', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT);
    const summary = buildSummary(cards, ACTIVE_EVENT);
    expect(summary).toContain('4 cards ready to print');
  });

  it('includes meal name with count', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT);
    const summary = buildSummary(cards, ACTIVE_EVENT);
    expect(summary).toContain('2 NY Strip Steak');   // 2 registrations with this meal
    expect(summary).toContain('1 Grilled Chicken Breast');
    expect(summary).toContain('1 Pan-Seared Salmon');
  });

  it('includes color names (Red, Green, Blue) in summary', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT);
    const summary = buildSummary(cards, ACTIVE_EVENT);
    expect(summary).toContain('Red');
    expect(summary).toContain('Green');
    expect(summary).toContain('Blue');
  });

  it('summary uses database meal names (not hardcoded food names)', () => {
    const differentEvent = {
      ...ACTIVE_EVENT,
      meal_choice_1: 'Portobello Wellington',
      meal_choice_2: 'Mahi Mahi',
      meal_choice_3: 'Brisket',
    };
    const regs = [{ id: 'r1', name: 'Test', meal_choice: 'Portobello Wellington', payment_status: 'paid', is_walkin: false, created_at: '2026-04-01T10:00:00Z' }];
    const cards = generateCards(regs, differentEvent);
    const summary = buildSummary(cards, differentEvent);
    expect(summary).toContain('Portobello Wellington');
    expect(summary).not.toContain('NY Strip');   // not hardcoded
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CARD CONTENT REQUIREMENTS
// ═══════════════════════════════════════════════════════════════════════════
describe('card content requirements', () => {
  it('card name is a non-empty string', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT);
    cards.forEach(card => {
      expect(typeof card.name).toBe('string');
      expect(card.name.length).toBeGreaterThan(0);
    });
  });

  it('card colorHex is a valid 6-digit hex color', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT);
    cards.forEach(card => {
      expect(card.colorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  it('card colorName is a human-readable string (Red, Green, or Blue)', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT);
    cards.forEach(card => {
      expect(['Red', 'Green', 'Blue', 'Gray']).toContain(card.colorName);
    });
  });

  it('card mealText matches the original registration meal_choice', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT, 'date'); // preserve order
    REGISTRATIONS.forEach((reg, i) => {
      expect(cards[i].mealText).toBe(reg.meal_choice);
    });
  });

  it('event name appears on every card (for identifying loose cards)', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT);
    cards.forEach(card => {
      expect(card.eventName).toBe(ACTIVE_EVENT.event_name);
    });
  });

  it('event date appears on every card (for identifying loose cards)', () => {
    const cards = generateCards(REGISTRATIONS, ACTIVE_EVENT);
    cards.forEach(card => {
      expect(card.eventDate).toBe(ACTIVE_EVENT.event_date);
    });
  });

  it('Meal 1 cards are Red — highly visible to servers from a distance', () => {
    const meal1Regs = [{ id: 'r1', name: 'Test', meal_choice: ACTIVE_EVENT.meal_choice_1, payment_status: 'paid', is_walkin: false, created_at: '2026-04-01T10:00:00Z' }];
    const cards = generateCards(meal1Regs, ACTIVE_EVENT);
    expect(cards[0].colorHex).toBe('#DC2626');
    expect(cards[0].colorName).toBe('Red');
  });

  it('Meal 2 cards are Green — distinct from Meal 1', () => {
    const meal2Regs = [{ id: 'r1', name: 'Test', meal_choice: ACTIVE_EVENT.meal_choice_2, payment_status: 'paid', is_walkin: false, created_at: '2026-04-01T10:00:00Z' }];
    const cards = generateCards(meal2Regs, ACTIVE_EVENT);
    expect(cards[0].colorHex).toBe('#16A34A');
    expect(cards[0].colorName).toBe('Green');
  });

  it('Meal 3 cards are Blue — distinct from Meals 1 and 2', () => {
    const meal3Regs = [{ id: 'r1', name: 'Test', meal_choice: ACTIVE_EVENT.meal_choice_3, payment_status: 'paid', is_walkin: false, created_at: '2026-04-01T10:00:00Z' }];
    const cards = generateCards(meal3Regs, ACTIVE_EVENT);
    expect(cards[0].colorHex).toBe('#2563EB');
    expect(cards[0].colorName).toBe('Blue');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════
describe('edge cases', () => {
  it('registration with unknown meal choice gets gray fallback color', () => {
    const weirdReg = [{ id: 'r1', name: 'Ghost', meal_choice: 'Mystery Meat', payment_status: 'paid', is_walkin: false, created_at: '2026-04-01T10:00:00Z' }];
    const cards = generateCards(weirdReg, ACTIVE_EVENT);
    expect(cards[0].colorHex).toBe('#888888'); // fallback gray
  });

  it('registration with null meal_choice falls back gracefully', () => {
    const nullMealReg = [{ id: 'r1', name: 'Nameless', meal_choice: null, payment_status: 'paid', is_walkin: false, created_at: '2026-04-01T10:00:00Z' }];
    const cards = generateCards(nullMealReg, ACTIVE_EVENT);
    expect(cards[0].mealText).toBe('');
    expect(cards[0].colorHex).toBe('#888888');
  });

  it('single registration generates exactly 1 card', () => {
    const cards = generateCards([REGISTRATIONS[0]], ACTIVE_EVENT);
    expect(cards.length).toBe(1);
  });

  it('large list (32 registrations) paginates into 6 pages', () => {
    const large = Array(32).fill(REGISTRATIONS[0]);
    const cards = generateCards(large, ACTIVE_EVENT);
    const pages = paginateCards(cards);
    expect(pages.length).toBe(Math.ceil(32 / CARDS_PER_PAGE)); // ceil(32/6) = 6
  });
});

// admin/meal-cards.js — Meal card generation logic (pure functions)
// Used by admin/app.js and tested by tests/meal-cards.test.js
// ── ALL color mapping is database-driven. Meal names are NEVER hardcoded. ──

'use strict';

/**
 * Color palette for meal cards.
 * Index 0 → Meal 1 (Red), 1 → Meal 2 (Green), 2 → Meal 3 (Blue).
 * Colors chosen for maximum contrast and instant server recognition.
 */
const MEAL_COLORS = [
  { hex: '#DC2626', name: 'Red'   }, // Meal 1
  { hex: '#16A34A', name: 'Green' }, // Meal 2
  { hex: '#2563EB', name: 'Blue'  }, // Meal 3
];

/**
 * Build a meal→color map from the active event.
 * Mapping is 100% database-driven:
 *   event.meal_choice_1 → Red
 *   event.meal_choice_2 → Green
 *   event.meal_choice_3 → Blue
 *
 * @param {Object|null} event - Active event record from Supabase
 * @returns {Object} Map of meal name string → { hex, name }
 */
function getMealColorMap(event) {
  if (!event) return {};
  const choices = [event.meal_choice_1, event.meal_choice_2, event.meal_choice_3];
  const map = {};
  choices.forEach((meal, i) => {
    if (meal) {
      map[meal] = MEAL_COLORS[i];
    }
  });
  return map;
}

/**
 * Generate card data from registrations.
 * ALL registrations get a card — paid, pending, and walk-ins alike.
 *
 * @param {Array|null} registrations - Registrations from Supabase (any payment status)
 * @param {Object|null} event - Active event record
 * @param {string} sortBy - 'name' | 'meal' | 'date'
 * @returns {Array} Sorted array of card objects
 */
function generateCards(registrations, event, sortBy = 'name') {
  if (!registrations || !registrations.length) return [];

  const colorMap = getMealColorMap(event);
  const eventName = event ? (event.event_name || '') : '';
  const eventDate = event ? (event.event_date || '') : '';

  const cards = registrations.map(r => {
    const color = colorMap[r.meal_choice] || { hex: '#888888', name: 'Gray' };
    return {
      name:      r.name || '',
      mealText:  r.meal_choice || '',
      colorHex:  color.hex,
      colorName: color.name,
      eventName,
      eventDate,
    };
  });

  if (sortBy === 'name') {
    cards.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === 'meal') {
    cards.sort((a, b) => a.mealText.localeCompare(b.mealText) || a.name.localeCompare(b.name));
  }
  // 'date' preserves insertion order (chronological from DB)

  return cards;
}

/**
 * Number of cards per printed page (2 columns × 3 rows = US Letter).
 * Changing this constant adjusts pagination everywhere.
 */
const CARDS_PER_PAGE = 6;

/**
 * Group card array into pages of CARDS_PER_PAGE.
 * @param {Array} cards
 * @returns {Array[]} Array of pages, each page is an array of cards
 */
function paginateCards(cards) {
  const pages = [];
  for (let i = 0; i < cards.length; i += CARDS_PER_PAGE) {
    pages.push(cards.slice(i, i + CARDS_PER_PAGE));
  }
  return pages;
}

/**
 * Build the summary line shown above the preview grid.
 * Example: "32 cards ready to print — 12 NY Strip (Red) | 11 Grilled Chicken (Green)"
 *
 * @param {Array} cards - Result of generateCards()
 * @param {Object|null} event - Active event record
 * @returns {string}
 */
function buildSummary(cards, event) {
  if (!cards || !cards.length) return 'No registrations yet';

  const colorMap = getMealColorMap(event);
  const counts = {};
  cards.forEach(c => {
    counts[c.mealText] = (counts[c.mealText] || 0) + 1;
  });

  const parts = Object.entries(counts).map(([meal, count]) => {
    const color = colorMap[meal];
    return `${count} ${meal}${color ? ` (${color.name})` : ''}`;
  });

  return `${cards.length} cards ready to print — ${parts.join(' | ')}`;
}

// Export depending on context:
//   Node.js / Vitest → module.exports (CommonJS)
//   Browser          → window.MealCards (global)
const _MealCardsExports = {
  MEAL_COLORS,
  getMealColorMap,
  generateCards,
  paginateCards,
  buildSummary,
  CARDS_PER_PAGE,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _MealCardsExports;
} else if (typeof window !== 'undefined') {
  window.MealCards = _MealCardsExports;
}

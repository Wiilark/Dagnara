// Static restaurant menu items — used as fallback when Nutritionix is not configured.
// Data is approximate, based on publicly available nutrition info (per standard serving).

export interface RestaurantItem {
  id: string;
  name: string;
  brand: string;
  icon: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sodium?: number;
  serving: string;
}

export const RESTAURANT_ITEMS: RestaurantItem[] = [
  // ── McDonald's ───────────────────────────────────────────────────────────────
  { id: 'mc1',  name: 'Big Mac',                   brand: "McDonald's", icon: '🍔', kcal: 550, protein: 25, carbs: 45, fat: 30, sodium: 1010, serving: '1 burger' },
  { id: 'mc2',  name: 'McChicken',                 brand: "McDonald's", icon: '🍔', kcal: 400, protein: 14, carbs: 40, fat: 21, sodium: 590,  serving: '1 burger' },
  { id: 'mc3',  name: 'Quarter Pounder with Cheese', brand: "McDonald's", icon: '🍔', kcal: 520, protein: 30, carbs: 42, fat: 26, sodium: 1090, serving: '1 burger' },
  { id: 'mc4',  name: 'Filet-O-Fish',              brand: "McDonald's", icon: '🐟', kcal: 390, protein: 16, carbs: 39, fat: 19, sodium: 580,  serving: '1 burger' },
  { id: 'mc5',  name: 'Large Fries',               brand: "McDonald's", icon: '🍟', kcal: 490, protein: 7,  carbs: 66, fat: 23, sodium: 400,  serving: 'large' },
  { id: 'mc6',  name: 'Medium Fries',              brand: "McDonald's", icon: '🍟', kcal: 320, protein: 4,  carbs: 43, fat: 15, sodium: 260,  serving: 'medium' },
  { id: 'mc7',  name: 'Egg McMuffin',              brand: "McDonald's", icon: '🥚', kcal: 310, protein: 17, carbs: 30, fat: 13, sodium: 750,  serving: '1 sandwich' },
  { id: 'mc8',  name: 'Sausage McMuffin',          brand: "McDonald's", icon: '🥚', kcal: 400, protein: 21, carbs: 29, fat: 23, sodium: 850,  serving: '1 sandwich' },
  { id: 'mc9',  name: 'Chicken McNuggets (10pc)',  brand: "McDonald's", icon: '🍗', kcal: 440, protein: 25, carbs: 27, fat: 27, sodium: 890,  serving: '10 pieces' },
  { id: 'mc10', name: 'Caesar Salad (no dressing)', brand: "McDonald's", icon: '🥗', kcal: 90,  protein: 8,  carbs: 7,  fat: 4,  sodium: 170,  serving: '1 salad' },
  { id: 'mc11', name: 'McCafé Latte (medium)',     brand: "McDonald's", icon: '☕', kcal: 190, protein: 10, carbs: 19, fat: 7,  sodium: 140,  serving: '16 oz' },
  { id: 'mc12', name: 'Hotcakes (3)',              brand: "McDonald's", icon: '🥞', kcal: 350, protein: 9,  carbs: 61, fat: 9,  sodium: 590,  serving: '3 cakes' },

  // ── Starbucks ────────────────────────────────────────────────────────────────
  { id: 'sb1',  name: 'Caffe Latte (grande)',      brand: 'Starbucks', icon: '☕', kcal: 190, protein: 13, carbs: 19, fat: 7,  sodium: 170,  serving: '16 oz' },
  { id: 'sb2',  name: 'Cappuccino (grande)',       brand: 'Starbucks', icon: '☕', kcal: 120, protein: 8,  carbs: 12, fat: 4,  sodium: 115,  serving: '16 oz' },
  { id: 'sb3',  name: 'Frappuccino Caramel (grande)', brand: 'Starbucks', icon: '🧋', kcal: 420, protein: 5, carbs: 66, fat: 16, sodium: 270, serving: '16 oz' },
  { id: 'sb4',  name: 'Cold Brew (grande)',        brand: 'Starbucks', icon: '🧊', kcal: 5,   protein: 0,  carbs: 0,  fat: 0,  sodium: 15,   serving: '16 oz' },
  { id: 'sb5',  name: 'Spinach Feta Egg Wrap',    brand: 'Starbucks', icon: '🌯', kcal: 290, protein: 19, carbs: 33, fat: 10, fiber: 3, sodium: 830, serving: '1 wrap' },
  { id: 'sb6',  name: 'Turkey Bacon Sandwich',    brand: 'Starbucks', icon: '🥪', kcal: 230, protein: 17, carbs: 28, fat: 6,  fiber: 2, sodium: 560, serving: '1 sandwich' },
  { id: 'sb7',  name: 'Blueberry Muffin',         brand: 'Starbucks', icon: '🫐', kcal: 350, protein: 5,  carbs: 57, fat: 11, sodium: 290,  serving: '1 muffin' },
  { id: 'sb8',  name: 'Banana Nut Bread',         brand: 'Starbucks', icon: '🍌', kcal: 420, protein: 6,  carbs: 60, fat: 18, sodium: 310,  serving: '1 slice' },
  { id: 'sb9',  name: 'Protein Box (Eggs & Cheese)', brand: 'Starbucks', icon: '🥚', kcal: 470, protein: 25, carbs: 45, fat: 23, fiber: 5, sodium: 680, serving: '1 box' },
  { id: 'sb10', name: 'Matcha Green Tea Latte (grande)', brand: 'Starbucks', icon: '🍵', kcal: 240, protein: 12, carbs: 35, fat: 6, sodium: 170, serving: '16 oz' },

  // ── Subway ───────────────────────────────────────────────────────────────────
  { id: 'sw1',  name: 'Turkey Breast (6")',        brand: 'Subway', icon: '🥪', kcal: 280, protein: 18, carbs: 45, fat: 4,  fiber: 4, sodium: 720,  serving: '6-inch' },
  { id: 'sw2',  name: 'Italian BMT (6")',          brand: 'Subway', icon: '🥪', kcal: 410, protein: 21, carbs: 45, fat: 18, fiber: 3, sodium: 1480, serving: '6-inch' },
  { id: 'sw3',  name: 'Veggie Delite (6")',        brand: 'Subway', icon: '🥪', kcal: 230, protein: 9,  carbs: 44, fat: 3,  fiber: 4, sodium: 380,  serving: '6-inch' },
  { id: 'sw4',  name: 'Chicken Teriyaki (6")',     brand: 'Subway', icon: '🥪', kcal: 370, protein: 26, carbs: 52, fat: 7,  fiber: 4, sodium: 730,  serving: '6-inch' },
  { id: 'sw5',  name: 'Tuna (6")',                 brand: 'Subway', icon: '🥪', kcal: 480, protein: 22, carbs: 44, fat: 25, fiber: 3, sodium: 700,  serving: '6-inch' },
  { id: 'sw6',  name: 'Footlong Turkey Breast',   brand: 'Subway', icon: '🥪', kcal: 560, protein: 36, carbs: 90, fat: 8,  fiber: 8, sodium: 1440, serving: 'footlong' },
  { id: 'sw7',  name: 'Meatball Marinara (6")',    brand: 'Subway', icon: '🥪', kcal: 480, protein: 23, carbs: 62, fat: 16, fiber: 5, sodium: 960,  serving: '6-inch' },
  { id: 'sw8',  name: 'Steak & Cheese (6")',       brand: 'Subway', icon: '🥪', kcal: 380, protein: 27, carbs: 46, fat: 13, fiber: 4, sodium: 1060, serving: '6-inch' },

  // ── Chipotle ─────────────────────────────────────────────────────────────────
  { id: 'ch1',  name: 'Burrito Bowl (Chicken)',    brand: 'Chipotle', icon: '🫕', kcal: 665, protein: 56, carbs: 51, fat: 23, fiber: 11, sodium: 1510, serving: '1 bowl' },
  { id: 'ch2',  name: 'Burrito (Steak)',           brand: 'Chipotle', icon: '🌯', kcal: 860, protein: 51, carbs: 93, fat: 30, fiber: 10, sodium: 1980, serving: '1 burrito' },
  { id: 'ch3',  name: 'Chicken Tacos (3)',         brand: 'Chipotle', icon: '🌮', kcal: 500, protein: 40, carbs: 52, fat: 16, fiber: 6,  sodium: 1080, serving: '3 tacos' },
  { id: 'ch4',  name: 'Vegetarian Bowl',           brand: 'Chipotle', icon: '🫕', kcal: 505, protein: 17, carbs: 70, fat: 18, fiber: 17, sodium: 1130, serving: '1 bowl' },
  { id: 'ch5',  name: 'Chips & Guacamole',         brand: 'Chipotle', icon: '🥑', kcal: 570, protein: 7,  carbs: 73, fat: 30, fiber: 11, sodium: 490,  serving: '1 order' },
  { id: 'ch6',  name: 'Sofritas Bowl',             brand: 'Chipotle', icon: '🫕', kcal: 545, protein: 22, carbs: 65, fat: 21, fiber: 13, sodium: 1560, serving: '1 bowl' },

  // ── KFC ──────────────────────────────────────────────────────────────────────
  { id: 'kf1',  name: 'Original Recipe Chicken (breast)', brand: 'KFC', icon: '🍗', kcal: 390, protein: 39, carbs: 11, fat: 21, sodium: 1010, serving: '1 piece' },
  { id: 'kf2',  name: 'Crispy Chicken Sandwich',  brand: 'KFC', icon: '🍔', kcal: 470, protein: 28, carbs: 47, fat: 18, sodium: 970,  serving: '1 sandwich' },
  { id: 'kf3',  name: 'Popcorn Chicken (large)',  brand: 'KFC', icon: '🍗', kcal: 560, protein: 27, carbs: 37, fat: 33, sodium: 1260, serving: 'large' },
  { id: 'kf4',  name: 'Mashed Potatoes & Gravy',  brand: 'KFC', icon: '🥔', kcal: 160, protein: 3,  carbs: 27, fat: 5,  sodium: 530,  serving: '1 side' },
  { id: 'kf5',  name: 'Cole Slaw',               brand: 'KFC', icon: '🥗', kcal: 170, protein: 1,  carbs: 22, fat: 9,  sodium: 135,  serving: '1 side' },

  // ── Burger King ──────────────────────────────────────────────────────────────
  { id: 'bk1',  name: 'Whopper',                  brand: 'Burger King', icon: '🍔', kcal: 660, protein: 28, carbs: 49, fat: 40, sodium: 980,  serving: '1 burger' },
  { id: 'bk2',  name: 'Chicken Sandwich',         brand: 'Burger King', icon: '🍔', kcal: 660, protein: 32, carbs: 52, fat: 38, sodium: 1110, serving: '1 sandwich' },
  { id: 'bk3',  name: 'Impossible Whopper',       brand: 'Burger King', icon: '🍔', kcal: 630, protein: 25, carbs: 58, fat: 34, sodium: 1080, serving: '1 burger' },
  { id: 'bk4',  name: 'Medium Onion Rings',       brand: 'Burger King', icon: '🧅', kcal: 320, protein: 4,  carbs: 40, fat: 16, sodium: 460,  serving: 'medium' },

  // ── Pizza Hut ────────────────────────────────────────────────────────────────
  { id: 'ph1',  name: 'Pepperoni Pizza (2 slices)', brand: 'Pizza Hut', icon: '🍕', kcal: 520, protein: 22, carbs: 56, fat: 22, sodium: 1280, serving: '2 slices (medium)' },
  { id: 'ph2',  name: 'Cheese Pizza (2 slices)',  brand: 'Pizza Hut', icon: '🍕', kcal: 440, protein: 20, carbs: 56, fat: 15, sodium: 1000, serving: '2 slices (medium)' },
  { id: 'ph3',  name: 'Veggie Lovers (2 slices)', brand: 'Pizza Hut', icon: '🍕', kcal: 380, protein: 16, carbs: 54, fat: 12, fiber: 3, sodium: 860, serving: '2 slices (medium)' },
  { id: 'ph4',  name: 'Breadsticks (2)',          brand: 'Pizza Hut', icon: '🥖', kcal: 170, protein: 5,  carbs: 28, fat: 5,  sodium: 360,  serving: '2 sticks' },

  // ── Domino's ─────────────────────────────────────────────────────────────────
  { id: 'dm1',  name: 'Pepperoni Pizza (2 slices)', brand: "Domino's", icon: '🍕', kcal: 480, protein: 20, carbs: 52, fat: 21, sodium: 1060, serving: '2 slices (medium)' },
  { id: 'dm2',  name: 'Pacific Veggie (2 slices)', brand: "Domino's", icon: '🍕', kcal: 370, protein: 14, carbs: 52, fat: 12, fiber: 3, sodium: 750, serving: '2 slices (medium)' },
  { id: 'dm3',  name: 'Chicken Wings (6pc)',      brand: "Domino's", icon: '🍗', kcal: 380, protein: 26, carbs: 14, fat: 26, sodium: 1030, serving: '6 wings' },
  { id: 'dm4',  name: 'Cheesy Bread (2 pieces)', brand: "Domino's", icon: '🥖', kcal: 190, protein: 7,  carbs: 26, fat: 7,  sodium: 330,  serving: '2 pieces' },

  // ── Panera Bread ─────────────────────────────────────────────────────────────
  { id: 'pb1',  name: 'Frontega Chicken Panini',  brand: 'Panera Bread', icon: '🥪', kcal: 860, protein: 46, carbs: 80, fat: 38, fiber: 4, sodium: 1840, serving: '1 sandwich' },
  { id: 'pb2',  name: 'Green Goddess Salad',      brand: 'Panera Bread', icon: '🥗', kcal: 490, protein: 26, carbs: 26, fat: 31, fiber: 5, sodium: 990, serving: '1 salad' },
  { id: 'pb3',  name: 'Fuji Apple Salad (chicken)', brand: 'Panera Bread', icon: '🥗', kcal: 560, protein: 40, carbs: 43, fat: 26, fiber: 6, sodium: 800, serving: '1 salad' },
  { id: 'pb4',  name: 'Broccoli Cheddar Soup',   brand: 'Panera Bread', icon: '🫕', kcal: 360, protein: 13, carbs: 31, fat: 21, sodium: 1110, serving: '1 bowl' },
  { id: 'pb5',  name: 'Blueberry Bagel',         brand: 'Panera Bread', icon: '🫐', kcal: 310, protein: 10, carbs: 65, fat: 2,  fiber: 3, sodium: 440, serving: '1 bagel' },

  // ── Chick-fil-A ──────────────────────────────────────────────────────────────
  { id: 'cfa1', name: 'Chicken Sandwich',         brand: 'Chick-fil-A', icon: '🍔', kcal: 440, protein: 28, carbs: 40, fat: 19, sodium: 1350, serving: '1 sandwich' },
  { id: 'cfa2', name: 'Spicy Deluxe Sandwich',   brand: 'Chick-fil-A', icon: '🍔', kcal: 550, protein: 33, carbs: 43, fat: 27, sodium: 1620, serving: '1 sandwich' },
  { id: 'cfa3', name: 'Nuggets (8pc)',            brand: 'Chick-fil-A', icon: '🍗', kcal: 250, protein: 27, carbs: 11, fat: 11, sodium: 960,  serving: '8 pieces' },
  { id: 'cfa4', name: 'Grilled Chicken Sandwich', brand: 'Chick-fil-A', icon: '🍔', kcal: 320, protein: 30, carbs: 36, fat: 6,  sodium: 800,  serving: '1 sandwich' },
  { id: 'cfa5', name: 'Waffle Potato Fries (medium)', brand: 'Chick-fil-A', icon: '🍟', kcal: 420, protein: 5, carbs: 55, fat: 20, sodium: 220, serving: 'medium' },
  { id: 'cfa6', name: 'Cobb Salad (grilled)',    brand: 'Chick-fil-A', icon: '🥗', kcal: 430, protein: 42, carbs: 25, fat: 19, fiber: 4, sodium: 1250, serving: '1 salad' },

  // ── Taco Bell ────────────────────────────────────────────────────────────────
  { id: 'tb1',  name: 'Crunchy Taco',             brand: 'Taco Bell', icon: '🌮', kcal: 170, protein: 8,  carbs: 13, fat: 10, sodium: 310,  serving: '1 taco' },
  { id: 'tb2',  name: 'Burrito Supreme (Beef)',   brand: 'Taco Bell', icon: '🌯', kcal: 440, protein: 18, carbs: 54, fat: 18, fiber: 7, sodium: 1120, serving: '1 burrito' },
  { id: 'tb3',  name: 'Chalupa Supreme',          brand: 'Taco Bell', icon: '🌮', kcal: 350, protein: 15, carbs: 33, fat: 18, sodium: 600,  serving: '1 chalupa' },
  { id: 'tb4',  name: 'Bean & Cheese Burrito',    brand: 'Taco Bell', icon: '🌯', kcal: 370, protein: 14, carbs: 54, fat: 11, fiber: 9, sodium: 1010, serving: '1 burrito' },
  { id: 'tb5',  name: 'Nachos BellGrande',        brand: 'Taco Bell', icon: '🧀', kcal: 740, protein: 20, carbs: 80, fat: 38, fiber: 11, sodium: 1180, serving: '1 order' },
];

export function searchLocalRestaurants(query: string): RestaurantItem[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return RESTAURANT_ITEMS.filter(
    item => item.name.toLowerCase().includes(q) || item.brand.toLowerCase().includes(q)
  ).slice(0, 20);
}

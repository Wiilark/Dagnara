// Local food database — all values per 100g, English names only.
// Nutrition data based on USDA FoodData Central standard reference values.

export interface LocalFood {
  id: string;
  name: string;
  icon: string;
  kcal: number;   // per 100g
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number; // mg
}

export const FOOD_DATABASE: LocalFood[] = [
  // ── Vegetables ────────────────────────────────────────────────────────────
  { id: 'v001', name: 'Tomato',            icon: '🍅', kcal: 18,  protein: 0.9, carbs: 3.9,  fat: 0.2, fiber: 1.2, sugar: 2.6,  sodium: 5   },
  { id: 'v002', name: 'Carrot',            icon: '🥕', kcal: 41,  protein: 0.9, carbs: 9.6,  fat: 0.2, fiber: 2.8, sugar: 4.7,  sodium: 69  },
  { id: 'v003', name: 'Broccoli',          icon: '🥦', kcal: 34,  protein: 2.8, carbs: 7.0,  fat: 0.4, fiber: 2.6, sugar: 1.7,  sodium: 33  },
  { id: 'v004', name: 'Spinach',           icon: '🥬', kcal: 23,  protein: 2.9, carbs: 3.6,  fat: 0.4, fiber: 2.2, sugar: 0.4,  sodium: 79  },
  { id: 'v005', name: 'Potato',            icon: '🥔', kcal: 77,  protein: 2.0, carbs: 17.0, fat: 0.1, fiber: 2.2, sugar: 0.8,  sodium: 6   },
  { id: 'v006', name: 'Sweet Potato',      icon: '🍠', kcal: 86,  protein: 1.6, carbs: 20.0, fat: 0.1, fiber: 3.0, sugar: 4.2,  sodium: 55  },
  { id: 'v007', name: 'Onion',             icon: '🧅', kcal: 40,  protein: 1.1, carbs: 9.3,  fat: 0.1, fiber: 1.7, sugar: 4.2,  sodium: 4   },
  { id: 'v008', name: 'Garlic',            icon: '🧄', kcal: 149, protein: 6.4, carbs: 33.0, fat: 0.5, fiber: 2.1, sugar: 1.0,  sodium: 17  },
  { id: 'v009', name: 'Cucumber',          icon: '🥒', kcal: 15,  protein: 0.7, carbs: 3.6,  fat: 0.1, fiber: 0.5, sugar: 1.7,  sodium: 2   },
  { id: 'v010', name: 'Lettuce',           icon: '🥬', kcal: 17,  protein: 1.2, carbs: 3.3,  fat: 0.3, fiber: 2.1, sugar: 1.2,  sodium: 8   },
  { id: 'v011', name: 'Bell Pepper',       icon: '🫑', kcal: 31,  protein: 1.0, carbs: 7.0,  fat: 0.3, fiber: 2.1, sugar: 4.2,  sodium: 4   },
  { id: 'v012', name: 'Celery',            icon: '🥬', kcal: 16,  protein: 0.7, carbs: 3.0,  fat: 0.2, fiber: 1.6, sugar: 1.3,  sodium: 80  },
  { id: 'v013', name: 'Kale',              icon: '🥬', kcal: 49,  protein: 4.3, carbs: 9.0,  fat: 0.9, fiber: 3.6, sugar: 2.3,  sodium: 38  },
  { id: 'v014', name: 'Zucchini',          icon: '🥒', kcal: 17,  protein: 1.2, carbs: 3.1,  fat: 0.3, fiber: 1.0, sugar: 2.5,  sodium: 8   },
  { id: 'v015', name: 'Corn',              icon: '🌽', kcal: 86,  protein: 3.3, carbs: 19.0, fat: 1.4, fiber: 2.7, sugar: 3.2,  sodium: 15  },
  { id: 'v016', name: 'Green Peas',        icon: '🫛', kcal: 81,  protein: 5.4, carbs: 14.0, fat: 0.4, fiber: 5.5, sugar: 5.7,  sodium: 5   },
  { id: 'v017', name: 'Green Beans',       icon: '🫛', kcal: 31,  protein: 1.8, carbs: 7.0,  fat: 0.1, fiber: 2.7, sugar: 3.3,  sodium: 6   },
  { id: 'v018', name: 'Cauliflower',       icon: '🥦', kcal: 25,  protein: 1.9, carbs: 5.0,  fat: 0.3, fiber: 2.0, sugar: 1.9,  sodium: 30  },
  { id: 'v019', name: 'Asparagus',         icon: '🥦', kcal: 20,  protein: 2.2, carbs: 3.9,  fat: 0.1, fiber: 2.1, sugar: 1.9,  sodium: 2   },
  { id: 'v020', name: 'Mushroom',          icon: '🍄', kcal: 22,  protein: 3.1, carbs: 3.3,  fat: 0.3, fiber: 1.0, sugar: 2.0,  sodium: 5   },
  { id: 'v021', name: 'Eggplant',          icon: '🍆', kcal: 25,  protein: 1.0, carbs: 6.0,  fat: 0.2, fiber: 3.0, sugar: 3.5,  sodium: 2   },
  { id: 'v022', name: 'Cabbage',           icon: '🥬', kcal: 25,  protein: 1.3, carbs: 5.8,  fat: 0.1, fiber: 2.5, sugar: 3.2,  sodium: 18  },
  { id: 'v023', name: 'Beets',             icon: '🫚', kcal: 43,  protein: 1.6, carbs: 10.0, fat: 0.2, fiber: 2.8, sugar: 7.0,  sodium: 78  },
  { id: 'v024', name: 'Pumpkin',           icon: '🎃', kcal: 26,  protein: 1.0, carbs: 6.5,  fat: 0.1, fiber: 0.5, sugar: 2.8,  sodium: 1   },
  { id: 'v025', name: 'Artichoke',         icon: '🥦', kcal: 47,  protein: 3.3, carbs: 11.0, fat: 0.2, fiber: 5.4, sugar: 1.0,  sodium: 94  },
  { id: 'v026', name: 'Brussels Sprouts',  icon: '🥦', kcal: 43,  protein: 3.4, carbs: 9.0,  fat: 0.3, fiber: 3.8, sugar: 2.2,  sodium: 25  },
  { id: 'v027', name: 'Leek',              icon: '🧅', kcal: 61,  protein: 1.5, carbs: 14.0, fat: 0.3, fiber: 1.8, sugar: 3.9,  sodium: 20  },
  { id: 'v028', name: 'Radish',            icon: '🌶️', kcal: 16,  protein: 0.7, carbs: 3.4,  fat: 0.1, fiber: 1.6, sugar: 1.9,  sodium: 39  },

  // ── Fruits ────────────────────────────────────────────────────────────────
  { id: 'f001', name: 'Apple',             icon: '🍎', kcal: 52,  protein: 0.3, carbs: 14.0, fat: 0.2, fiber: 2.4, sugar: 10.0, sodium: 1   },
  { id: 'f002', name: 'Banana',            icon: '🍌', kcal: 89,  protein: 1.1, carbs: 23.0, fat: 0.3, fiber: 2.6, sugar: 12.0, sodium: 1   },
  { id: 'f003', name: 'Orange',            icon: '🍊', kcal: 47,  protein: 0.9, carbs: 12.0, fat: 0.1, fiber: 2.4, sugar: 9.4,  sodium: 0   },
  { id: 'f004', name: 'Strawberry',        icon: '🍓', kcal: 32,  protein: 0.7, carbs: 7.7,  fat: 0.3, fiber: 2.0, sugar: 4.9,  sodium: 1   },
  { id: 'f005', name: 'Blueberry',         icon: '🫐', kcal: 57,  protein: 0.7, carbs: 14.0, fat: 0.3, fiber: 2.4, sugar: 10.0, sodium: 1   },
  { id: 'f006', name: 'Grape',             icon: '🍇', kcal: 67,  protein: 0.6, carbs: 17.0, fat: 0.4, fiber: 0.9, sugar: 16.0, sodium: 2   },
  { id: 'f007', name: 'Watermelon',        icon: '🍉', kcal: 30,  protein: 0.6, carbs: 7.6,  fat: 0.2, fiber: 0.4, sugar: 6.2,  sodium: 1   },
  { id: 'f008', name: 'Mango',             icon: '🥭', kcal: 60,  protein: 0.8, carbs: 15.0, fat: 0.4, fiber: 1.6, sugar: 14.0, sodium: 1   },
  { id: 'f009', name: 'Pineapple',         icon: '🍍', kcal: 50,  protein: 0.5, carbs: 13.0, fat: 0.1, fiber: 1.4, sugar: 10.0, sodium: 1   },
  { id: 'f010', name: 'Peach',             icon: '🍑', kcal: 39,  protein: 0.9, carbs: 10.0, fat: 0.3, fiber: 1.5, sugar: 8.4,  sodium: 0   },
  { id: 'f011', name: 'Pear',              icon: '🍐', kcal: 57,  protein: 0.4, carbs: 15.0, fat: 0.1, fiber: 3.1, sugar: 10.0, sodium: 1   },
  { id: 'f012', name: 'Cherry',            icon: '🍒', kcal: 50,  protein: 1.0, carbs: 12.0, fat: 0.3, fiber: 1.6, sugar: 8.0,  sodium: 0   },
  { id: 'f013', name: 'Kiwi',              icon: '🥝', kcal: 61,  protein: 1.1, carbs: 15.0, fat: 0.5, fiber: 3.0, sugar: 9.0,  sodium: 3   },
  { id: 'f014', name: 'Lemon',             icon: '🍋', kcal: 29,  protein: 1.1, carbs: 9.0,  fat: 0.3, fiber: 2.8, sugar: 2.5,  sodium: 2   },
  { id: 'f015', name: 'Avocado',           icon: '🥑', kcal: 160, protein: 2.0, carbs: 9.0,  fat: 15.0, fiber: 6.7, sugar: 0.7, sodium: 7   },
  { id: 'f016', name: 'Raspberry',         icon: '🫐', kcal: 52,  protein: 1.2, carbs: 12.0, fat: 0.7, fiber: 6.5, sugar: 4.4,  sodium: 1   },
  { id: 'f017', name: 'Blackberry',        icon: '🫐', kcal: 43,  protein: 1.4, carbs: 10.0, fat: 0.5, fiber: 5.3, sugar: 4.9,  sodium: 1   },
  { id: 'f018', name: 'Pomegranate',       icon: '🍎', kcal: 83,  protein: 1.7, carbs: 19.0, fat: 1.2, fiber: 4.0, sugar: 14.0, sodium: 3   },
  { id: 'f019', name: 'Plum',              icon: '🍑', kcal: 46,  protein: 0.7, carbs: 11.0, fat: 0.3, fiber: 1.4, sugar: 9.9,  sodium: 0   },
  { id: 'f020', name: 'Apricot',           icon: '🍑', kcal: 48,  protein: 1.4, carbs: 11.0, fat: 0.4, fiber: 2.0, sugar: 9.2,  sodium: 1   },
  { id: 'f021', name: 'Coconut',           icon: '🥥', kcal: 354, protein: 3.3, carbs: 15.0, fat: 33.0, fiber: 9.0, sugar: 6.2, sodium: 20  },
  { id: 'f022', name: 'Melon',             icon: '🍈', kcal: 34,  protein: 0.8, carbs: 8.2,  fat: 0.2, fiber: 0.9, sugar: 7.9,  sodium: 16  },
  { id: 'f023', name: 'Fig',               icon: '🍈', kcal: 74,  protein: 0.8, carbs: 19.0, fat: 0.3, fiber: 3.0, sugar: 16.0, sodium: 1   },
  { id: 'f024', name: 'Lime',              icon: '🍋', kcal: 30,  protein: 0.7, carbs: 10.0, fat: 0.2, fiber: 2.8, sugar: 1.7,  sodium: 2   },

  // ── Meat & Poultry ────────────────────────────────────────────────────────
  { id: 'm001', name: 'Chicken Breast',    icon: '🍗', kcal: 165, protein: 31.0, carbs: 0,   fat: 3.6,  fiber: 0, sugar: 0, sodium: 74  },
  { id: 'm002', name: 'Chicken Thigh',     icon: '🍗', kcal: 209, protein: 26.0, carbs: 0,   fat: 11.0, fiber: 0, sugar: 0, sodium: 88  },
  { id: 'm003', name: 'Chicken Drumstick', icon: '🍗', kcal: 172, protein: 28.0, carbs: 0,   fat: 5.7,  fiber: 0, sugar: 0, sodium: 93  },
  { id: 'm004', name: 'Ground Beef',       icon: '🥩', kcal: 254, protein: 26.0, carbs: 0,   fat: 17.0, fiber: 0, sugar: 0, sodium: 75  },
  { id: 'm005', name: 'Beef Steak',        icon: '🥩', kcal: 207, protein: 26.0, carbs: 0,   fat: 11.0, fiber: 0, sugar: 0, sodium: 60  },
  { id: 'm006', name: 'Pork Chop',         icon: '🥩', kcal: 231, protein: 25.0, carbs: 0,   fat: 14.0, fiber: 0, sugar: 0, sodium: 63  },
  { id: 'm007', name: 'Bacon',             icon: '🥓', kcal: 541, protein: 37.0, carbs: 1.4, fat: 42.0, fiber: 0, sugar: 0, sodium: 1717},
  { id: 'm008', name: 'Turkey Breast',     icon: '🍗', kcal: 135, protein: 30.0, carbs: 0,   fat: 1.0,  fiber: 0, sugar: 0, sodium: 70  },
  { id: 'm009', name: 'Lamb',              icon: '🥩', kcal: 282, protein: 25.0, carbs: 0,   fat: 19.0, fiber: 0, sugar: 0, sodium: 75  },
  { id: 'm010', name: 'Ham',               icon: '🥩', kcal: 163, protein: 17.0, carbs: 1.5, fat: 10.0, fiber: 0, sugar: 1.4, sodium: 1300},
  { id: 'm011', name: 'Sausage',           icon: '🌭', kcal: 301, protein: 12.0, carbs: 4.0, fat: 27.0, fiber: 0, sugar: 0, sodium: 748 },
  { id: 'm012', name: 'Hot Dog',           icon: '🌭', kcal: 290, protein: 11.0, carbs: 2.3, fat: 26.0, fiber: 0, sugar: 1.1, sodium: 860 },
  { id: 'm013', name: 'Pepperoni',         icon: '🍕', kcal: 494, protein: 21.0, carbs: 2.0, fat: 44.0, fiber: 0, sugar: 0, sodium: 1750},
  { id: 'm014', name: 'Beef Burger Patty', icon: '🍔', kcal: 285, protein: 21.0, carbs: 0,   fat: 22.0, fiber: 0, sugar: 0, sodium: 79  },

  // ── Seafood ───────────────────────────────────────────────────────────────
  { id: 's001', name: 'Salmon',            icon: '🐟', kcal: 208, protein: 20.0, carbs: 0,   fat: 13.0, fiber: 0, sugar: 0, sodium: 59  },
  { id: 's002', name: 'Tuna',              icon: '🐟', kcal: 144, protein: 23.0, carbs: 0,   fat: 5.0,  fiber: 0, sugar: 0, sodium: 39  },
  { id: 's003', name: 'Tuna (canned)',     icon: '🐟', kcal: 109, protein: 25.0, carbs: 0,   fat: 0.8,  fiber: 0, sugar: 0, sodium: 321 },
  { id: 's004', name: 'Shrimp',            icon: '🦐', kcal: 99,  protein: 24.0, carbs: 0.2, fat: 0.3,  fiber: 0, sugar: 0, sodium: 111 },
  { id: 's005', name: 'Cod',               icon: '🐟', kcal: 82,  protein: 18.0, carbs: 0,   fat: 0.7,  fiber: 0, sugar: 0, sodium: 54  },
  { id: 's006', name: 'Tilapia',           icon: '🐟', kcal: 96,  protein: 20.0, carbs: 0,   fat: 1.7,  fiber: 0, sugar: 0, sodium: 56  },
  { id: 's007', name: 'Sardines',          icon: '🐟', kcal: 208, protein: 25.0, carbs: 0,   fat: 11.0, fiber: 0, sugar: 0, sodium: 505 },
  { id: 's008', name: 'Crab',              icon: '🦀', kcal: 97,  protein: 19.0, carbs: 0,   fat: 1.5,  fiber: 0, sugar: 0, sodium: 911 },
  { id: 's009', name: 'Lobster',           icon: '🦞', kcal: 89,  protein: 19.0, carbs: 0,   fat: 0.9,  fiber: 0, sugar: 0, sodium: 296 },
  { id: 's010', name: 'Mackerel',          icon: '🐟', kcal: 205, protein: 19.0, carbs: 0,   fat: 14.0, fiber: 0, sugar: 0, sodium: 90  },

  // ── Dairy ─────────────────────────────────────────────────────────────────
  { id: 'd001', name: 'Whole Milk',        icon: '🥛', kcal: 61,  protein: 3.2,  carbs: 4.8,  fat: 3.3,  fiber: 0, sugar: 5.1,  sodium: 44  },
  { id: 'd002', name: 'Skim Milk',         icon: '🥛', kcal: 34,  protein: 3.4,  carbs: 5.0,  fat: 0.1,  fiber: 0, sugar: 5.0,  sodium: 47  },
  { id: 'd003', name: 'Greek Yogurt',      icon: '🫙', kcal: 59,  protein: 10.0, carbs: 3.6,  fat: 0.4,  fiber: 0, sugar: 3.2,  sodium: 36  },
  { id: 'd004', name: 'Plain Yogurt',      icon: '🫙', kcal: 61,  protein: 3.5,  carbs: 4.7,  fat: 3.3,  fiber: 0, sugar: 4.7,  sodium: 46  },
  { id: 'd005', name: 'Cheddar Cheese',    icon: '🧀', kcal: 403, protein: 25.0, carbs: 1.3,  fat: 33.0, fiber: 0, sugar: 0.5,  sodium: 621 },
  { id: 'd006', name: 'Mozzarella',        icon: '🧀', kcal: 280, protein: 28.0, carbs: 2.2,  fat: 17.0, fiber: 0, sugar: 1.0,  sodium: 486 },
  { id: 'd007', name: 'Parmesan',          icon: '🧀', kcal: 431, protein: 38.0, carbs: 4.1,  fat: 29.0, fiber: 0, sugar: 0.8,  sodium: 1529},
  { id: 'd008', name: 'Cottage Cheese',    icon: '🫙', kcal: 98,  protein: 11.0, carbs: 3.4,  fat: 4.3,  fiber: 0, sugar: 2.7,  sodium: 364 },
  { id: 'd009', name: 'Butter',            icon: '🧈', kcal: 717, protein: 0.9,  carbs: 0.1,  fat: 81.0, fiber: 0, sugar: 0.1,  sodium: 11  },
  { id: 'd010', name: 'Heavy Cream',       icon: '🥛', kcal: 340, protein: 2.8,  carbs: 2.8,  fat: 36.0, fiber: 0, sugar: 2.8,  sodium: 27  },
  { id: 'd011', name: 'Sour Cream',        icon: '🫙', kcal: 193, protein: 2.4,  carbs: 4.6,  fat: 19.0, fiber: 0, sugar: 4.0,  sodium: 53  },
  { id: 'd012', name: 'Cream Cheese',      icon: '🧀', kcal: 342, protein: 6.0,  carbs: 4.1,  fat: 34.0, fiber: 0, sugar: 3.8,  sodium: 321 },
  { id: 'd013', name: 'Swiss Cheese',      icon: '🧀', kcal: 380, protein: 27.0, carbs: 5.4,  fat: 28.0, fiber: 0, sugar: 0.4,  sodium: 187 },

  // ── Eggs ──────────────────────────────────────────────────────────────────
  { id: 'e001', name: 'Egg (whole)',        icon: '🥚', kcal: 143, protein: 13.0, carbs: 1.0,  fat: 10.0, fiber: 0, sugar: 1.0,  sodium: 142 },
  { id: 'e002', name: 'Egg White',          icon: '🥚', kcal: 52,  protein: 11.0, carbs: 0.7,  fat: 0.2,  fiber: 0, sugar: 0.7,  sodium: 166 },
  { id: 'e003', name: 'Egg Yolk',           icon: '🥚', kcal: 322, protein: 16.0, carbs: 3.6,  fat: 27.0, fiber: 0, sugar: 0.6,  sodium: 48  },
  { id: 'e004', name: 'Scrambled Eggs',     icon: '🍳', kcal: 148, protein: 10.0, carbs: 1.6,  fat: 11.0, fiber: 0, sugar: 1.2,  sodium: 165 },
  { id: 'e005', name: 'Boiled Egg',         icon: '🥚', kcal: 155, protein: 13.0, carbs: 1.1,  fat: 11.0, fiber: 0, sugar: 1.1,  sodium: 124 },

  // ── Grains & Bread ────────────────────────────────────────────────────────
  { id: 'g001', name: 'White Rice (cooked)', icon: '🍚', kcal: 130, protein: 2.7, carbs: 28.0, fat: 0.3, fiber: 0.4, sugar: 0,   sodium: 1   },
  { id: 'g002', name: 'Brown Rice (cooked)', icon: '🍚', kcal: 123, protein: 2.7, carbs: 26.0, fat: 1.0, fiber: 1.8, sugar: 0,   sodium: 5   },
  { id: 'g003', name: 'Oats (dry)',          icon: '🥣', kcal: 389, protein: 17.0, carbs: 66.0, fat: 7.0, fiber: 11.0, sugar: 1.0, sodium: 2  },
  { id: 'g004', name: 'Oatmeal (cooked)',    icon: '🥣', kcal: 71,  protein: 2.5,  carbs: 12.0, fat: 1.5, fiber: 1.7, sugar: 0.5, sodium: 49  },
  { id: 'g005', name: 'White Bread',         icon: '🍞', kcal: 265, protein: 9.0,  carbs: 51.0, fat: 3.2, fiber: 2.7, sugar: 5.0, sodium: 491 },
  { id: 'g006', name: 'Whole Wheat Bread',   icon: '🍞', kcal: 247, protein: 13.0, carbs: 41.0, fat: 4.2, fiber: 7.0, sugar: 5.7, sodium: 400 },
  { id: 'g007', name: 'Pasta (dry)',         icon: '🍝', kcal: 371, protein: 13.0, carbs: 75.0, fat: 1.5, fiber: 3.2, sugar: 2.7, sodium: 6   },
  { id: 'g008', name: 'Pasta (cooked)',      icon: '🍝', kcal: 158, protein: 6.0,  carbs: 31.0, fat: 0.9, fiber: 1.8, sugar: 0.6, sodium: 1   },
  { id: 'g009', name: 'Quinoa (cooked)',     icon: '🍚', kcal: 120, protein: 4.4,  carbs: 22.0, fat: 1.9, fiber: 2.8, sugar: 0.9, sodium: 7   },
  { id: 'g010', name: 'Flour Tortilla',      icon: '🫓', kcal: 312, protein: 8.0,  carbs: 54.0, fat: 7.1, fiber: 3.5, sugar: 2.8, sodium: 529 },
  { id: 'g011', name: 'Corn Tortilla',       icon: '🫓', kcal: 218, protein: 5.7,  carbs: 46.0, fat: 2.5, fiber: 6.3, sugar: 0.4, sodium: 5   },
  { id: 'g012', name: 'Granola',             icon: '🥣', kcal: 471, protein: 10.0, carbs: 64.0, fat: 20.0, fiber: 5.6, sugar: 19.0, sodium: 32},
  { id: 'g013', name: 'Bagel',               icon: '🥯', kcal: 245, protein: 9.8,  carbs: 47.0, fat: 1.5, fiber: 1.8, sugar: 5.2, sodium: 443 },
  { id: 'g014', name: 'Croissant',           icon: '🥐', kcal: 406, protein: 8.2,  carbs: 46.0, fat: 21.0, fiber: 2.8, sugar: 11.0, sodium: 375},
  { id: 'g015', name: 'Pita Bread',          icon: '🫓', kcal: 275, protein: 9.0,  carbs: 56.0, fat: 1.2, fiber: 2.2, sugar: 0.8, sodium: 536 },
  { id: 'g016', name: 'Cornflakes',          icon: '🥣', kcal: 357, protein: 7.5,  carbs: 84.0, fat: 0.4, fiber: 3.8, sugar: 8.0, sodium: 500 },
  { id: 'g017', name: 'White Rice (dry)',    icon: '🍚', kcal: 365, protein: 7.1,  carbs: 80.0, fat: 0.7, fiber: 1.3, sugar: 0,   sodium: 5   },
  { id: 'g018', name: 'Couscous (cooked)',   icon: '🍚', kcal: 112, protein: 3.8,  carbs: 23.0, fat: 0.2, fiber: 1.4, sugar: 0.1, sodium: 5   },

  // ── Legumes ───────────────────────────────────────────────────────────────
  { id: 'l001', name: 'Black Beans',       icon: '🫘', kcal: 132, protein: 9.0,  carbs: 24.0, fat: 0.5, fiber: 8.7, sugar: 0.3, sodium: 1   },
  { id: 'l002', name: 'Kidney Beans',      icon: '🫘', kcal: 127, protein: 8.7,  carbs: 23.0, fat: 0.5, fiber: 7.4, sugar: 0.3, sodium: 2   },
  { id: 'l003', name: 'Chickpeas',         icon: '🫘', kcal: 164, protein: 8.9,  carbs: 27.0, fat: 2.6, fiber: 7.6, sugar: 4.8, sodium: 7   },
  { id: 'l004', name: 'Lentils (cooked)',  icon: '🫘', kcal: 116, protein: 9.0,  carbs: 20.0, fat: 0.4, fiber: 7.9, sugar: 1.8, sodium: 2   },
  { id: 'l005', name: 'Tofu (firm)',       icon: '🫙', kcal: 76,  protein: 8.0,  carbs: 1.9,  fat: 4.8, fiber: 0.3, sugar: 0.9, sodium: 7   },
  { id: 'l006', name: 'Edamame',           icon: '🫘', kcal: 121, protein: 11.0, carbs: 9.0,  fat: 5.2, fiber: 5.0, sugar: 2.2, sodium: 6   },
  { id: 'l007', name: 'Pinto Beans',       icon: '🫘', kcal: 143, protein: 9.0,  carbs: 27.0, fat: 0.6, fiber: 9.0, sugar: 0.3, sodium: 1   },
  { id: 'l008', name: 'White Beans',       icon: '🫘', kcal: 139, protein: 10.0, carbs: 25.0, fat: 0.4, fiber: 6.3, sugar: 0.3, sodium: 2   },

  // ── Nuts & Seeds ──────────────────────────────────────────────────────────
  { id: 'n001', name: 'Almonds',           icon: '🌰', kcal: 579, protein: 21.0, carbs: 22.0, fat: 50.0, fiber: 12.0, sugar: 4.4, sodium: 1 },
  { id: 'n002', name: 'Walnuts',           icon: '🌰', kcal: 654, protein: 15.0, carbs: 14.0, fat: 65.0, fiber: 6.7, sugar: 2.6, sodium: 2  },
  { id: 'n003', name: 'Cashews',           icon: '🌰', kcal: 553, protein: 18.0, carbs: 30.0, fat: 44.0, fiber: 3.3, sugar: 5.9, sodium: 12 },
  { id: 'n004', name: 'Peanuts',           icon: '🥜', kcal: 567, protein: 26.0, carbs: 16.0, fat: 49.0, fiber: 8.5, sugar: 4.0, sodium: 18 },
  { id: 'n005', name: 'Peanut Butter',     icon: '🥜', kcal: 588, protein: 25.0, carbs: 20.0, fat: 50.0, fiber: 6.0, sugar: 9.2, sodium: 459},
  { id: 'n006', name: 'Sunflower Seeds',   icon: '🌻', kcal: 584, protein: 21.0, carbs: 20.0, fat: 51.0, fiber: 8.6, sugar: 2.6, sodium: 9  },
  { id: 'n007', name: 'Chia Seeds',        icon: '🌱', kcal: 486, protein: 17.0, carbs: 42.0, fat: 31.0, fiber: 34.0, sugar: 0, sodium: 16  },
  { id: 'n008', name: 'Flaxseeds',         icon: '🌱', kcal: 534, protein: 18.0, carbs: 29.0, fat: 42.0, fiber: 27.0, sugar: 1.6, sodium: 30},
  { id: 'n009', name: 'Pistachios',        icon: '🌰', kcal: 562, protein: 20.0, carbs: 28.0, fat: 45.0, fiber: 10.0, sugar: 7.7, sodium: 1 },
  { id: 'n010', name: 'Pecans',            icon: '🌰', kcal: 691, protein: 9.2,  carbs: 14.0, fat: 72.0, fiber: 9.6, sugar: 3.9, sodium: 0  },
  { id: 'n011', name: 'Hazelnuts',         icon: '🌰', kcal: 628, protein: 15.0, carbs: 17.0, fat: 61.0, fiber: 9.7, sugar: 4.3, sodium: 0  },
  { id: 'n012', name: 'Pumpkin Seeds',     icon: '🌱', kcal: 559, protein: 30.0, carbs: 11.0, fat: 49.0, fiber: 6.0, sugar: 1.4, sodium: 7  },

  // ── Oils & Fats ───────────────────────────────────────────────────────────
  { id: 'o001', name: 'Olive Oil',         icon: '🫒', kcal: 884, protein: 0,    carbs: 0,    fat: 100.0, fiber: 0, sugar: 0,  sodium: 2   },
  { id: 'o002', name: 'Vegetable Oil',     icon: '🫙', kcal: 884, protein: 0,    carbs: 0,    fat: 100.0, fiber: 0, sugar: 0,  sodium: 0   },
  { id: 'o003', name: 'Coconut Oil',       icon: '🥥', kcal: 892, protein: 0,    carbs: 0,    fat: 99.0,  fiber: 0, sugar: 0,  sodium: 0   },

  // ── Condiments & Sweeteners ───────────────────────────────────────────────
  { id: 'c001', name: 'Ketchup',           icon: '🫙', kcal: 101, protein: 1.7,  carbs: 26.0, fat: 0.1, fiber: 0.3, sugar: 22.0, sodium: 907},
  { id: 'c002', name: 'Mustard',           icon: '🫙', kcal: 66,  protein: 4.4,  carbs: 6.4,  fat: 3.3, fiber: 3.2, sugar: 0.8, sodium: 1115},
  { id: 'c003', name: 'Mayonnaise',        icon: '🫙', kcal: 680, protein: 1.0,  carbs: 0.6,  fat: 75.0, fiber: 0, sugar: 0.5, sodium: 635 },
  { id: 'c004', name: 'Honey',             icon: '🍯', kcal: 304, protein: 0.3,  carbs: 82.0, fat: 0,   fiber: 0.2, sugar: 82.0, sodium: 4  },
  { id: 'c005', name: 'Sugar',             icon: '🍬', kcal: 387, protein: 0,    carbs: 100.0, fat: 0,  fiber: 0, sugar: 100.0, sodium: 1  },
  { id: 'c006', name: 'Maple Syrup',       icon: '🍁', kcal: 260, protein: 0.1,  carbs: 67.0, fat: 0.1, fiber: 0, sugar: 60.0, sodium: 12  },
  { id: 'c007', name: 'Soy Sauce',         icon: '🫙', kcal: 53,  protein: 8.1,  carbs: 5.0,  fat: 0.6, fiber: 0.8, sugar: 1.7, sodium: 5493},
  { id: 'c008', name: 'Salsa',             icon: '🫙', kcal: 36,  protein: 1.5,  carbs: 7.0,  fat: 0.2, fiber: 1.7, sugar: 4.0, sodium: 440 },
  { id: 'c009', name: 'Hummus',            icon: '🫙', kcal: 177, protein: 8.0,  carbs: 17.0, fat: 9.6, fiber: 6.0, sugar: 0.9, sodium: 379 },
  { id: 'c010', name: 'Jam',               icon: '🫙', kcal: 278, protein: 0.4,  carbs: 69.0, fat: 0.1, fiber: 1.1, sugar: 54.0, sodium: 31 },
  { id: 'c011', name: 'Ranch Dressing',    icon: '🫙', kcal: 140, protein: 1.0,  carbs: 10.0, fat: 11.0, fiber: 0, sugar: 2.0, sodium: 340 },
  { id: 'c012', name: 'Caesar Dressing',   icon: '🫙', kcal: 352, protein: 2.7,  carbs: 7.0,  fat: 36.0, fiber: 0, sugar: 1.0, sodium: 717 },

  // ── Beverages ─────────────────────────────────────────────────────────────
  { id: 'b001', name: 'Orange Juice',      icon: '🍊', kcal: 45,  protein: 0.7,  carbs: 10.0, fat: 0.2, fiber: 0.2, sugar: 8.4, sodium: 1   },
  { id: 'b002', name: 'Apple Juice',       icon: '🍎', kcal: 46,  protein: 0.1,  carbs: 11.0, fat: 0.1, fiber: 0.1, sugar: 9.6, sodium: 4   },
  { id: 'b003', name: 'Coffee (black)',    icon: '☕', kcal: 2,   protein: 0.3,  carbs: 0,    fat: 0,   fiber: 0, sugar: 0,   sodium: 2   },
  { id: 'b004', name: 'Green Tea',         icon: '🍵', kcal: 1,   protein: 0,    carbs: 0.2,  fat: 0,   fiber: 0, sugar: 0,   sodium: 1   },
  { id: 'b005', name: 'Cola',              icon: '🥤', kcal: 37,  protein: 0,    carbs: 10.0, fat: 0,   fiber: 0, sugar: 10.0, sodium: 11  },
  { id: 'b006', name: 'Beer',              icon: '🍺', kcal: 43,  protein: 0.5,  carbs: 3.6,  fat: 0,   fiber: 0, sugar: 0,   sodium: 14  },
  { id: 'b007', name: 'Red Wine',          icon: '🍷', kcal: 85,  protein: 0.1,  carbs: 2.6,  fat: 0,   fiber: 0, sugar: 0.6, sodium: 4   },
  { id: 'b008', name: 'Coconut Water',     icon: '🥥', kcal: 19,  protein: 0.7,  carbs: 3.7,  fat: 0.2, fiber: 1.0, sugar: 2.6, sodium: 105 },
  { id: 'b009', name: 'Almond Milk',       icon: '🥛', kcal: 17,  protein: 0.6,  carbs: 1.4,  fat: 1.2, fiber: 0.3, sugar: 0.8, sodium: 73  },
  { id: 'b010', name: 'Protein Shake',     icon: '💪', kcal: 120, protein: 25.0, carbs: 5.0,  fat: 2.0, fiber: 1.0, sugar: 3.0, sodium: 150 },

  // ── Snacks & Sweets ───────────────────────────────────────────────────────
  { id: 'sn01', name: 'Potato Chips',      icon: '🥔', kcal: 536, protein: 7.0,  carbs: 53.0, fat: 35.0, fiber: 4.4, sugar: 0.4, sodium: 525},
  { id: 'sn02', name: 'Popcorn (plain)',   icon: '🍿', kcal: 387, protein: 13.0, carbs: 78.0, fat: 4.5, fiber: 15.0, sugar: 0.9, sodium: 8  },
  { id: 'sn03', name: 'Crackers',          icon: '🍘', kcal: 421, protein: 9.0,  carbs: 70.0, fat: 12.0, fiber: 3.9, sugar: 5.9, sodium: 687},
  { id: 'sn04', name: 'Dark Chocolate',    icon: '🍫', kcal: 604, protein: 5.5,  carbs: 46.0, fat: 44.0, fiber: 11.0, sugar: 24.0, sodium: 20},
  { id: 'sn05', name: 'Milk Chocolate',    icon: '🍫', kcal: 535, protein: 7.6,  carbs: 60.0, fat: 30.0, fiber: 3.4, sugar: 52.0, sodium: 79},
  { id: 'sn06', name: 'Ice Cream',         icon: '🍦', kcal: 207, protein: 3.5,  carbs: 24.0, fat: 11.0, fiber: 0.7, sugar: 21.0, sodium: 80},
  { id: 'sn07', name: 'Donut',             icon: '🍩', kcal: 452, protein: 4.9,  carbs: 51.0, fat: 25.0, fiber: 1.5, sugar: 21.0, sodium: 326},
  { id: 'sn08', name: 'Muffin',            icon: '🧁', kcal: 375, protein: 5.3,  carbs: 55.0, fat: 15.0, fiber: 1.9, sugar: 28.0, sodium: 380},
  { id: 'sn09', name: 'Cookie',            icon: '🍪', kcal: 480, protein: 5.0,  carbs: 65.0, fat: 23.0, fiber: 1.5, sugar: 35.0, sodium: 327},
  { id: 'sn10', name: 'Granola Bar',       icon: '🍫', kcal: 375, protein: 6.0,  carbs: 64.0, fat: 11.0, fiber: 3.5, sugar: 25.0, sodium: 210},
  { id: 'sn11', name: 'Pretzels',          icon: '🥨', kcal: 381, protein: 9.0,  carbs: 80.0, fat: 3.5, fiber: 2.9, sugar: 1.1, sodium: 1029},

  // ── Prepared / Fast Food ──────────────────────────────────────────────────
  { id: 'p001', name: 'Cheese Pizza',      icon: '🍕', kcal: 266, protein: 11.0, carbs: 33.0, fat: 10.0, fiber: 2.3, sugar: 3.6, sodium: 598},
  { id: 'p002', name: 'Hamburger',         icon: '🍔', kcal: 295, protein: 17.0, carbs: 24.0, fat: 14.0, fiber: 0.9, sugar: 5.6, sodium: 396},
  { id: 'p003', name: 'French Fries',      icon: '🍟', kcal: 312, protein: 3.4,  carbs: 41.0, fat: 15.0, fiber: 3.8, sugar: 0.3, sodium: 210},
  { id: 'p004', name: 'Caesar Salad',      icon: '🥗', kcal: 70,  protein: 4.0,  carbs: 5.0,  fat: 4.0, fiber: 1.5, sugar: 1.3, sodium: 270},
  { id: 'p005', name: 'Chicken Sandwich',  icon: '🥪', kcal: 283, protein: 18.0, carbs: 29.0, fat: 10.0, fiber: 1.5, sugar: 5.0, sodium: 560},
  { id: 'p006', name: 'BLT Sandwich',      icon: '🥪', kcal: 252, protein: 12.0, carbs: 26.0, fat: 11.0, fiber: 1.8, sugar: 4.0, sodium: 700},
  { id: 'p007', name: 'Grilled Cheese',    icon: '🧀', kcal: 290, protein: 11.0, carbs: 26.0, fat: 17.0, fiber: 1.0, sugar: 3.5, sodium: 580},
  { id: 'p008', name: 'Burrito',           icon: '🌯', kcal: 209, protein: 8.9,  carbs: 26.0, fat: 7.8, fiber: 2.4, sugar: 1.5, sodium: 526},
  { id: 'p009', name: 'Tacos',             icon: '🌮', kcal: 226, protein: 11.0, carbs: 20.0, fat: 11.0, fiber: 2.5, sugar: 2.0, sodium: 460},
  { id: 'p010', name: 'Fried Chicken',     icon: '🍗', kcal: 246, protein: 32.0, carbs: 8.7,  fat: 9.7, fiber: 0.3, sugar: 0.2, sodium: 513},
  { id: 'p011', name: 'Pancakes',          icon: '🥞', kcal: 227, protein: 6.0,  carbs: 38.0, fat: 6.5, fiber: 1.5, sugar: 7.0, sodium: 479},
  { id: 'p012', name: 'Waffles',           icon: '🧇', kcal: 291, protein: 7.9,  carbs: 42.0, fat: 10.0, fiber: 1.5, sugar: 6.5, sodium: 612},
  { id: 'p013', name: 'Fried Rice',        icon: '🍳', kcal: 163, protein: 4.5,  carbs: 26.0, fat: 4.8, fiber: 1.0, sugar: 1.5, sodium: 570},
  { id: 'p014', name: 'Grilled Salmon',    icon: '🐟', kcal: 208, protein: 28.0, carbs: 0,    fat: 10.0, fiber: 0, sugar: 0,   sodium: 68  },
  { id: 'p015', name: 'Chicken Soup',      icon: '🍲', kcal: 53,  protein: 4.6,  carbs: 6.0,  fat: 1.4, fiber: 0.5, sugar: 1.2, sodium: 400},
  { id: 'p016', name: 'Beef Stew',         icon: '🍲', kcal: 104, protein: 8.0,  carbs: 9.0,  fat: 4.0, fiber: 1.5, sugar: 2.0, sodium: 360},
  { id: 'p017', name: 'Sushi (rice roll)', icon: '🍱', kcal: 150, protein: 6.0,  carbs: 27.0, fat: 2.0, fiber: 1.0, sugar: 3.0, sodium: 270},
  { id: 'p018', name: 'Nachos',            icon: '🫔', kcal: 346, protein: 8.0,  carbs: 45.0, fat: 16.0, fiber: 3.5, sugar: 1.5, sodium: 460},
];

// ── Recipes ───────────────────────────────────────────────────────────────────
// All values per 100 g (approximate, based on typical recipe compositions)
export const RECIPE_DATABASE: LocalFood[] = [
  { id: 'r001', name: 'Greek Salad',        icon: '🥗', kcal: 120, protein: 3.5,  carbs: 6.0,  fat: 9.0,  fiber: 1.5, sugar: 3.8,  sodium: 320 },
  { id: 'r002', name: 'Caesar Salad',        icon: '🥗', kcal: 155, protein: 7.0,  carbs: 8.0,  fat: 11.0, fiber: 1.2, sugar: 1.5,  sodium: 390 },
  { id: 'r003', name: 'Chicken Stir Fry',    icon: '🍳', kcal: 130, protein: 14.0, carbs: 8.0,  fat: 5.0,  fiber: 1.5, sugar: 3.0,  sodium: 450 },
  { id: 'r004', name: 'Beef Bolognese',      icon: '🍝', kcal: 175, protein: 12.0, carbs: 14.0, fat: 8.0,  fiber: 1.5, sugar: 3.5,  sodium: 380 },
  { id: 'r005', name: 'Vegetable Soup',      icon: '🍲', kcal: 50,  protein: 2.5,  carbs: 8.0,  fat: 1.2,  fiber: 2.5, sugar: 3.0,  sodium: 350 },
  { id: 'r006', name: 'Avocado Toast',       icon: '🥑', kcal: 195, protein: 5.5,  carbs: 20.0, fat: 11.0, fiber: 4.5, sugar: 1.5,  sodium: 310 },
  { id: 'r007', name: 'Overnight Oats',      icon: '🥣', kcal: 130, protein: 5.5,  carbs: 22.0, fat: 3.0,  fiber: 3.0, sugar: 8.0,  sodium: 60  },
  { id: 'r008', name: 'Tuna Salad',          icon: '🐟', kcal: 130, protein: 16.0, carbs: 3.5,  fat: 6.0,  fiber: 0.5, sugar: 1.5,  sodium: 420 },
  { id: 'r009', name: 'Protein Pancakes',    icon: '🥞', kcal: 195, protein: 15.0, carbs: 22.0, fat: 5.5,  fiber: 1.5, sugar: 4.5,  sodium: 280 },
  { id: 'r010', name: 'Lentil Soup',         icon: '🍲', kcal: 90,  protein: 6.5,  carbs: 14.0, fat: 1.5,  fiber: 4.5, sugar: 2.0,  sodium: 310 },
  { id: 'r011', name: 'Salmon with Quinoa',  icon: '🐟', kcal: 175, protein: 17.0, carbs: 13.0, fat: 6.5,  fiber: 1.5, sugar: 0.5,  sodium: 230 },
  { id: 'r012', name: 'Chicken Rice Bowl',   icon: '🍱', kcal: 155, protein: 15.0, carbs: 17.0, fat: 3.5,  fiber: 1.0, sugar: 1.5,  sodium: 340 },
  { id: 'r013', name: 'Caprese Salad',       icon: '🍅', kcal: 150, protein: 8.0,  carbs: 4.5,  fat: 11.0, fiber: 0.5, sugar: 3.5,  sodium: 380 },
  { id: 'r014', name: 'Berry Smoothie Bowl', icon: '🫐', kcal: 100, protein: 5.0,  carbs: 18.0, fat: 1.5,  fiber: 2.5, sugar: 12.0, sodium: 35  },
  { id: 'r015', name: 'Pasta Primavera',     icon: '🍝', kcal: 160, protein: 5.5,  carbs: 28.0, fat: 4.0,  fiber: 2.5, sugar: 3.5,  sodium: 230 },
  { id: 'r016', name: 'Breakfast Burrito',   icon: '🌯', kcal: 200, protein: 10.0, carbs: 22.0, fat: 8.5,  fiber: 2.0, sugar: 2.5,  sodium: 490 },
  { id: 'r017', name: 'Veggie Omelette',     icon: '🍳', kcal: 145, protein: 11.0, carbs: 4.5,  fat: 9.5,  fiber: 1.0, sugar: 2.5,  sodium: 280 },
  { id: 'r018', name: 'Chicken Caesar Wrap', icon: '🌯', kcal: 205, protein: 16.0, carbs: 18.0, fat: 8.5,  fiber: 1.5, sugar: 2.0,  sodium: 560 },
];

/** Search the local food database and recipe database. Returns results ranked by match quality. */
export function searchLocalFoods(query: string): LocalFood[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const exact: LocalFood[] = [];
  const startsWith: LocalFood[] = [];
  const contains: LocalFood[] = [];

  for (const food of [...FOOD_DATABASE, ...RECIPE_DATABASE]) {
    const name = food.name.toLowerCase();
    if (name === q) {
      exact.push(food);
    } else if (name.startsWith(q)) {
      startsWith.push(food);
    } else if (name.includes(q)) {
      contains.push(food);
    } else {
      // Word-level match (e.g. "breast" matches "Chicken Breast")
      const words = name.split(' ');
      if (words.some(w => w.startsWith(q))) {
        contains.push(food);
      }
    }
  }

  return [...exact, ...startsWith, ...contains];
}

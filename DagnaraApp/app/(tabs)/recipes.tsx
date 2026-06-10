import { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  Modal, StyleSheet, Alert, Image, Dimensions, type ImageSourcePropType,
  Animated, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useDiaryStore } from '../../src/store/diaryStore';
import { colors, spacing, fontSize, radius } from '../../src/theme';
import { useAppStore } from '../../src/store/appStore';
import { useAuthStore } from '../../src/store/authStore';
import { FOOD_DATABASE, type LocalFood } from '../../src/lib/foodDatabase';
import { addRecipesToGrocery } from '../../src/lib/grocery';
import { fmt } from '../../src/lib/format';

// Map of recipe id → bundled hero photo. Recipes without an entry fall back
// to the emoji icon. Add more ids here to give any other recipe a photo.
const RECIPE_PHOTOS: Record<string, ImageSourcePropType> = {
  '1': require('../../assets/recipes/greek-salad.jpg'),
};

// Modal hero photo — width is 77% of device width (capped at 300, so iPhone 13/14 hits
// exactly 300). Height is 75% of the width (classic 4:3 landscape ratio).
// App is portrait-only so reading Dimensions at module scope is safe.
const MODAL_PHOTO_WIDTH = Math.min(Math.round(Dimensions.get('window').width * 0.77), 300);
const MODAL_PHOTO_HEIGHT = Math.round(MODAL_PHOTO_WIDTH * 0.6);

const DIET_FILTERS = ['All', 'For your goal', 'Quick', 'Breakfast', 'Lunch', 'Dinner', 'Snack', 'High Protein', 'Low Carb', 'Vegan', 'Keto', 'Vegetarian', 'Mediterranean'];

const MEAL_PICK = [
  { key: 'breakfast' as const, icon: '🍳', label: 'Breakfast', color: colors.honey },
  { key: 'lunch'     as const, icon: '🥗', label: 'Lunch',     color: colors.violet },
  { key: 'dinner'    as const, icon: '🍝', label: 'Dinner',    color: colors.sky },
  { key: 'snack'     as const, icon: '🍌', label: 'Snack',     color: colors.rose },
];

const RECIPES = [
  { id: '1',  icon: '🥗',  name: 'Greek Salad',          diet: 'Vegan',       meal: 'Lunch',     kcal: 220, carbs: 18, protein: 6,  fat: 14, time: '10 min', goal: 'weight_loss',   ingredients: [{ qty: '200g', name: 'Cucumber' }, { qty: '250g', name: 'Tomato' }, { qty: '50g', name: 'Kalamata olives' }, { qty: '80g', name: 'Feta cheese' }, { qty: '60g', name: 'Red onion' }, { qty: '2 tbsp (30ml)', name: 'Olive oil' }], steps: ['Chop all vegetables.', 'Combine in a bowl.', 'Add feta and olives.', 'Drizzle with olive oil and season.'] },
  { id: '2',  icon: '🍗',  name: 'Grilled Chicken',       diet: 'High Protein', meal: 'Dinner',   kcal: 320, carbs: 2,  protein: 52, fat: 10, time: '25 min', goal: 'muscle_gain',   ingredients: [{ qty: '200g', name: 'Chicken breast' }, { qty: '1 tbsp (15ml)', name: 'Olive oil' }, { qty: '2 cloves', name: 'Garlic' }, { qty: '½ piece', name: 'Lemon' }, { qty: '2 sprigs', name: 'Rosemary' }], steps: ['Place chicken breast in a zip-lock bag and pound to 1.5cm thickness with a rolling pin or heavy pan — grocery store breasts are thick and uneven, so pounding is what makes it cook through without drying out.', 'Coat chicken with olive oil, minced garlic, and lemon juice. Cover and refrigerate at least 30 min (up to 2 hours) — the longer the better.', 'Take chicken out of the fridge 10 min before cooking to take the chill off.', 'Grill over medium-high heat 6–7 min each side until 75°C internal.', 'Rest 5 min before serving.'] },
  { id: '3',  icon: '🥑',  name: 'Avocado Toast',         diet: 'Vegetarian',  meal: 'Breakfast', kcal: 290, carbs: 28, protein: 8,  fat: 17, time: '8 min',  goal: 'balanced',      ingredients: [{ qty: '2 slices (80g)', name: 'Sourdough bread' }, { qty: '1 medium (150g)', name: 'Avocado' }, { qty: '1 tsp (5ml)', name: 'Lemon juice' }, { qty: '¼ tsp', name: 'Red pepper flakes' }, { qty: '¼ tsp', name: 'Salt' }], steps: ['Toast bread until golden.', 'Mash avocado with lemon juice and salt.', 'Spread on toast, top with pepper flakes.'] },
  { id: '4',  icon: '🐟',  name: 'Salmon Bowl',           diet: 'High Protein', meal: 'Lunch',    kcal: 450, carbs: 32, protein: 44, fat: 16, time: '20 min', goal: 'muscle_gain',   ingredients: [{ qty: '150g', name: 'Salmon fillet' }, { qty: '100g (dry)', name: 'Brown rice' }, { qty: '80g', name: 'Edamame' }, { qty: '2 tbsp (30ml)', name: 'Soy sauce' }, { qty: '1 tsp', name: 'Sesame seeds' }, { qty: '60g', name: 'Cucumber' }], steps: ['Rinse rice until water runs clear, then cook per package (about 18 min covered for white, 35 min for brown). Start this first — it takes the longest.', 'Pan-sear salmon over medium-high heat 4 min each side until just opaque in center.', 'Assemble bowl with all ingredients.', 'Drizzle soy sauce and sprinkle sesame seeds.'] },
  { id: '5',  icon: '🥚',  name: 'Egg White Omelette',    diet: 'Keto',        meal: 'Breakfast', kcal: 180, carbs: 3,  protein: 28, fat: 6,  time: '10 min', goal: 'weight_loss',   ingredients: [{ qty: '4 whites (120ml)', name: 'Egg whites' }, { qty: '50g', name: 'Spinach' }, { qty: '60g', name: 'Bell pepper' }, { qty: '1 tsp (5g)', name: 'Butter' }, { qty: '¼ tsp', name: 'Salt' }, { qty: '¼ tsp', name: 'Pepper' }], steps: ['Whisk egg whites with salt.', 'Melt butter and sauté vegetables over medium heat 2 min.', 'Pour egg whites over vegetables.', 'Cook over medium heat 1–2 min until edges set, then fold.'] },
  { id: '6',  icon: '🍲',  name: 'Lentil Soup',           diet: 'Vegan',       meal: 'Dinner',    kcal: 280, carbs: 42, protein: 16, fat: 4,  time: '35 min', goal: 'balanced',      ingredients: [{ qty: '100g (dry)', name: 'Red lentils' }, { qty: '1 medium (100g)', name: 'Onion' }, { qty: '100g', name: 'Carrots' }, { qty: '1 tbsp (15ml)', name: 'Olive oil' }, { qty: '1 tsp', name: 'Cumin' }, { qty: '500ml', name: 'Vegetable stock' }, { qty: '½ piece', name: 'Lemon' }], steps: ['Sauté onion and carrots in olive oil over medium heat 5 min until softened.', 'Add lentils, cumin, and stock.', 'Simmer over low heat 25 min.', 'Blend partially and squeeze lemon.'] },
  { id: '7',  icon: '🥣',  name: 'Overnight Oats',        diet: 'Vegetarian',  meal: 'Breakfast', kcal: 350, carbs: 55, protein: 12, fat: 8,  time: '5 min',  goal: 'balanced',      ingredients: [{ qty: '80g', name: 'Rolled oats' }, { qty: '200ml', name: 'Almond milk' }, { qty: '1 tbsp (10g)', name: 'Chia seeds' }, { qty: '1 medium (120g)', name: 'Banana' }, { qty: '1 tbsp (20ml)', name: 'Honey' }], steps: ['Mix oats, milk and chia seeds.', 'Refrigerate overnight.', 'Top with banana and honey before serving.'] },
  { id: '8',  icon: '🌮',  name: 'Chicken Tacos',         diet: 'High Protein', meal: 'Dinner',   kcal: 420, carbs: 38, protein: 36, fat: 12, time: '20 min', goal: 'muscle_gain',   ingredients: [{ qty: '200g', name: 'Chicken thighs' }, { qty: '3 pieces', name: 'Corn tortillas' }, { qty: '½ piece', name: 'Lime' }, { qty: '10g', name: 'Cilantro' }, { qty: '3 tbsp (45ml)', name: 'Salsa' }, { qty: '½ medium (75g)', name: 'Avocado' }], steps: ['Season and grill chicken over medium-high heat 6–7 min per side until 75°C internal.', 'Slice into strips.', 'Warm tortillas and assemble tacos.', 'Top with salsa, avocado, and lime.'] },
  { id: '9',  icon: '🥜',  name: 'Peanut Butter Smoothie', diet: 'High Protein', meal: 'Breakfast', kcal: 380, carbs: 30, protein: 22, fat: 18, time: '5 min', goal: 'muscle_gain', ingredients: [{ qty: '1 medium (120g)', name: 'Banana' }, { qty: '2 tbsp (32g)', name: 'Peanut butter' }, { qty: '1 scoop (30g)', name: 'Protein powder' }, { qty: '250ml', name: 'Oat milk' }, { qty: '1 tsp (7ml)', name: 'Honey' }], steps: ['Add all ingredients to blender.', 'Blend until smooth.', 'Serve immediately.'] },
  { id: '10', icon: '🫘',  name: 'Black Bean Bowl',        diet: 'Vegan',       meal: 'Lunch',     kcal: 310, carbs: 48, protein: 14, fat: 6,  time: '15 min', goal: 'weight_loss',   ingredients: [{ qty: '150g (cooked)', name: 'Black beans' }, { qty: '80g (dry)', name: 'Brown rice' }, { qty: '60g', name: 'Corn' }, { qty: '80g', name: 'Bell peppers' }, { qty: '1 tsp', name: 'Cumin' }, { qty: '½ piece', name: 'Lime' }], steps: ['Warm beans with cumin over low heat 3 min until heated through.', 'Rinse rice until water runs clear, then cook per package (about 18 min covered for white, 35 min for brown). Start this first — it takes the longest.', 'Assemble bowl with all ingredients.', 'Squeeze lime over the top.'] },
  // Breakfast
  { id: '11', icon: '🥞', name: 'Protein Pancakes', diet: 'High Protein', meal: 'Breakfast', kcal: 340, carbs: 38, protein: 28, fat: 8, time: '15 min', goal: 'muscle_gain', ingredients: [{ qty: '80g', name: 'Oat flour' }, { qty: '2 pieces', name: 'Eggs' }, { qty: '1 medium (120g)', name: 'Banana' }, { qty: '1 scoop (30g)', name: 'Protein powder' }, { qty: '1 tsp', name: 'Baking powder' }, { qty: '100ml', name: 'Almond milk' }], steps: ['Mash banana and mix with eggs.', 'Add oat flour, protein powder, and baking powder.', 'Add milk slowly until batter is pourable but still thick — like a thick yogurt that drops off the spoon in dollops, not runs.', 'Cook in non-stick pan over medium heat, 2 min per side.'] },
  { id: '12', icon: '🍳', name: 'Scrambled Eggs', diet: 'Keto', meal: 'Breakfast', kcal: 220, carbs: 2, protein: 16, fat: 16, time: '8 min', goal: 'weight_loss', ingredients: [{ qty: '3 pieces', name: 'Eggs' }, { qty: '1 tsp (5g)', name: 'Butter' }, { qty: '¼ tsp', name: 'Salt' }, { qty: '¼ tsp', name: 'Pepper' }, { qty: '5g', name: 'Chives' }], steps: ['Whisk eggs with salt and pepper.', 'Melt butter in pan over low heat.', 'Add eggs and fold gently.', 'Remove from heat when just set.'] },
  { id: '13', icon: '🫐', name: 'Berry Smoothie Bowl', diet: 'Vegan', meal: 'Breakfast', kcal: 310, carbs: 58, protein: 8, fat: 5, time: '5 min', goal: 'weight_loss', ingredients: [{ qty: '150g', name: 'Frozen mixed berries' }, { qty: '1 medium (120g)', name: 'Banana' }, { qty: '80ml', name: 'Oat milk' }, { qty: '30g', name: 'Granola' }, { qty: '1 tbsp (10g)', name: 'Chia seeds' }, { qty: '1 tsp (7ml)', name: 'Honey' }], steps: ['Blend frozen berries and banana with minimal milk.', 'Pour into bowl.', 'Top with granola, chia seeds, and honey.'] },
  { id: '14', icon: '🥐', name: 'Greek Yogurt Parfait', diet: 'Vegetarian', meal: 'Breakfast', kcal: 280, carbs: 35, protein: 18, fat: 7, time: '5 min', goal: 'balanced', ingredients: [{ qty: '200g', name: 'Greek yogurt' }, { qty: '40g', name: 'Granola' }, { qty: '100g', name: 'Mixed berries' }, { qty: '1 tbsp (20ml)', name: 'Honey' }, { qty: '20g', name: 'Almonds' }], steps: ['Layer yogurt in a glass.', 'Add granola and berries.', 'Drizzle with honey and top with almonds.'] },
  { id: '15', icon: '🍵', name: 'Matcha Oatmeal', diet: 'Vegan', meal: 'Breakfast', kcal: 295, carbs: 52, protein: 9, fat: 6, time: '10 min', goal: 'balanced', ingredients: [{ qty: '80g', name: 'Rolled oats' }, { qty: '1 tsp (3g)', name: 'Matcha powder' }, { qty: '250ml', name: 'Almond milk' }, { qty: '1 tbsp (15ml)', name: 'Maple syrup' }, { qty: '1 tbsp (10g)', name: 'Hemp seeds' }, { qty: '1 medium (120g)', name: 'Banana' }], steps: ['Cook oats with almond milk.', 'Stir in matcha powder and maple syrup.', 'Top with hemp seeds and sliced banana.'] },
  { id: '16', icon: '🥚', name: 'Veggie Frittata', diet: 'Vegetarian', meal: 'Breakfast', kcal: 260, carbs: 8, protein: 20, fat: 16, time: '20 min', goal: 'weight_loss', ingredients: [{ qty: '3 pieces', name: 'Eggs' }, { qty: '100g', name: 'Zucchini' }, { qty: '80g', name: 'Bell pepper' }, { qty: '60g', name: 'Onion' }, { qty: '40g', name: 'Feta cheese' }, { qty: '1 tbsp (15ml)', name: 'Olive oil' }], steps: ['Sauté vegetables in oven-safe pan over medium heat 4–5 min until softened.', 'Whisk eggs and pour over vegetables.', 'Add crumbled feta.', 'Bake at 180C for 12 min until set.'] },
  // Lunch
  { id: '17', icon: '🌯', name: 'Turkey Wrap', diet: 'High Protein', meal: 'Lunch', kcal: 380, carbs: 32, protein: 34, fat: 12, time: '10 min', goal: 'muscle_gain', ingredients: [{ qty: '1 piece (65g)', name: 'Whole wheat tortilla' }, { qty: '120g', name: 'Turkey slices' }, { qty: '½ medium (75g)', name: 'Avocado' }, { qty: '20g', name: 'Lettuce' }, { qty: '1 medium (120g)', name: 'Tomato' }, { qty: '1 tsp', name: 'Mustard' }], steps: ['Lay tortilla flat.', 'Layer turkey, avocado, lettuce, tomato.', 'Drizzle mustard.', 'Roll tightly and slice.'] },
  { id: '18', icon: '🥙', name: 'Falafel Pita', diet: 'Vegan', meal: 'Lunch', kcal: 420, carbs: 56, protein: 14, fat: 16, time: '20 min', goal: 'balanced', ingredients: [{ qty: '4 pieces (160g)', name: 'Falafel balls' }, { qty: '1 piece (75g)', name: 'Pita bread' }, { qty: '3 tbsp (60g)', name: 'Hummus' }, { qty: '60g', name: 'Cucumber' }, { qty: '1 medium (120g)', name: 'Tomato' }, { qty: '2 tbsp (30ml)', name: 'Tahini' }], steps: ['Warm falafel in oven at 180°C for 10 min until heated through.', 'Open pita and spread hummus.', 'Add falafel and vegetables.', 'Drizzle with tahini.'] },
  { id: '19', icon: '🍱', name: 'Tuna Nicoise', diet: 'High Protein', meal: 'Lunch', kcal: 390, carbs: 22, protein: 38, fat: 16, time: '15 min', goal: 'weight_loss', ingredients: [{ qty: '150g', name: 'Canned tuna' }, { qty: '100g', name: 'Green beans' }, { qty: '100g', name: 'Cherry tomatoes' }, { qty: '1 piece', name: 'Boiled egg' }, { qty: '30g', name: 'Olives' }, { qty: '2 tbsp (30ml)', name: 'Dijon dressing' }], steps: ['Blanch green beans 3 min.', 'Arrange all ingredients on plate.', 'Drizzle with Dijon vinaigrette.'] },
  { id: '20', icon: '🫙', name: 'Mason Jar Salad', diet: 'Vegetarian', meal: 'Lunch', kcal: 340, carbs: 28, protein: 14, fat: 20, time: '10 min', goal: 'weight_loss', ingredients: [{ qty: '80g', name: 'Mixed greens' }, { qty: '80g', name: 'Cherry tomatoes' }, { qty: '80g', name: 'Cucumber' }, { qty: '80g', name: 'Chickpeas' }, { qty: '40g', name: 'Feta' }, { qty: '2 tbsp (30ml)', name: 'Balsamic dressing' }], steps: ['Layer dressing at bottom.', 'Add chickpeas and tomatoes.', 'Add cucumber and greens on top.', 'Seal and refrigerate until ready.'] },
  { id: '21', icon: '🍜', name: 'Miso Soup Ramen', diet: 'Vegetarian', meal: 'Lunch', kcal: 360, carbs: 50, protein: 16, fat: 8, time: '20 min', goal: 'balanced', ingredients: [{ qty: '80g (dry)', name: 'Ramen noodles' }, { qty: '1 tbsp (15g)', name: 'Miso paste' }, { qty: '100g', name: 'Tofu' }, { qty: '80g', name: 'Bok choy' }, { qty: '10g', name: 'Green onion' }, { qty: '1 tsp (5ml)', name: 'Sesame oil' }], steps: ['Boil noodles over high heat per package.', 'Dissolve miso in hot water.', 'Add cubed tofu and bok choy.', 'Top with green onion and sesame oil.'] },
  { id: '22', icon: '🥗', name: 'Quinoa Power Bowl', diet: 'Vegan', meal: 'Lunch', kcal: 400, carbs: 52, protein: 16, fat: 14, time: '25 min', goal: 'balanced', ingredients: [{ qty: '80g (dry)', name: 'Quinoa' }, { qty: '150g', name: 'Roasted sweet potato' }, { qty: '60g', name: 'Spinach' }, { qty: '20g', name: 'Pumpkin seeds' }, { qty: '3 tbsp (45ml)', name: 'Lemon tahini dressing' }, { qty: '½ medium (75g)', name: 'Avocado' }], steps: ['Rinse quinoa under cold water (this removes the bitter coating), then simmer in 2× water covered 15 min until grains show little white tails.', 'Roast sweet potato cubes at 200°C for 20–25 min until tender.', 'Assemble bowl and drizzle tahini dressing.'] },
  { id: '23', icon: '🍗', name: 'Caesar Salad with Chicken', diet: 'High Protein', meal: 'Lunch', kcal: 430, carbs: 12, protein: 46, fat: 22, time: '20 min', goal: 'muscle_gain', ingredients: [{ qty: '150g', name: 'Romaine lettuce' }, { qty: '180g', name: 'Grilled chicken' }, { qty: '30g', name: 'Parmesan' }, { qty: '30g', name: 'Croutons' }, { qty: '3 tbsp (45ml)', name: 'Caesar dressing' }, { qty: '½ piece', name: 'Lemon' }], steps: ['Grill chicken over medium-high heat 6–7 min per side until 75°C internal, then slice.', 'Tear lettuce and toss with dressing.', 'Add chicken and croutons.', 'Top with parmesan and lemon.'] },
  { id: '24', icon: '🫔', name: 'Veggie Burrito Bowl', diet: 'Vegan', meal: 'Lunch', kcal: 370, carbs: 60, protein: 12, fat: 8, time: '15 min', goal: 'balanced', ingredients: [{ qty: '100g (dry)', name: 'Brown rice' }, { qty: '150g (cooked)', name: 'Black beans' }, { qty: '80g', name: 'Corn' }, { qty: '1 tsp', name: 'Cumin' }, { qty: '4 tbsp (60ml)', name: 'Salsa' }, { qty: '80g', name: 'Guacamole' }, { qty: '½ piece', name: 'Lime' }], steps: ['Rinse rice until water runs clear, then cook per package (about 18 min covered for white, 35 min for brown). Start this first — it takes the longest.', 'Warm beans with cumin over low heat 3 min until heated through.', 'Assemble bowl with all toppings.', 'Squeeze lime and add salsa.'] },
  // Dinner
  { id: '25', icon: '🥩', name: 'Beef Stir Fry', diet: 'High Protein', meal: 'Dinner', kcal: 480, carbs: 28, protein: 44, fat: 20, time: '20 min', goal: 'muscle_gain', ingredients: [{ qty: '200g', name: 'Beef strips' }, { qty: '100g', name: 'Broccoli' }, { qty: '80g', name: 'Bell pepper' }, { qty: '3 tbsp (45ml)', name: 'Soy sauce' }, { qty: '1 tsp (5g)', name: 'Ginger' }, { qty: '2 cloves', name: 'Garlic' }, { qty: '100g (dry)', name: 'Rice' }], steps: ['Rinse rice until water runs clear, then cook per package (about 18 min covered for white, 35 min for brown). Start this first — it takes the longest.', 'Stir-fry beef in hot wok over high heat 2–3 min until browned.', 'Add vegetables and stir fry over high heat 3 min.', 'Add soy sauce, ginger, garlic.', 'Serve over rice.'] },
  { id: '26', icon: '🐟', name: 'Baked Cod', diet: 'High Protein', meal: 'Dinner', kcal: 310, carbs: 8, protein: 46, fat: 10, time: '25 min', goal: 'weight_loss', ingredients: [{ qty: '200g', name: 'Cod fillet' }, { qty: '½ piece', name: 'Lemon' }, { qty: '1 tbsp (15g)', name: 'Capers' }, { qty: '1 tbsp (15ml)', name: 'Olive oil' }, { qty: '2 cloves', name: 'Garlic' }, { qty: '5g', name: 'Parsley' }], steps: ['Preheat oven to 200C.', 'Place cod in baking dish with olive oil and lemon.', 'Top with capers and garlic.', 'Bake 12 min until cod flakes easily.', 'Garnish with parsley.'] },
  { id: '27', icon: '🍲', name: 'Chickpea Curry', diet: 'Vegan', meal: 'Dinner', kcal: 380, carbs: 54, protein: 14, fat: 10, time: '30 min', goal: 'balanced', ingredients: [{ qty: '200g (cooked)', name: 'Chickpeas' }, { qty: '200ml', name: 'Coconut milk' }, { qty: '150g', name: 'Tomatoes' }, { qty: '1 tbsp (8g)', name: 'Curry powder' }, { qty: '1 medium (100g)', name: 'Onion' }, { qty: '2 cloves', name: 'Garlic' }, { qty: '80g (dry)', name: 'Basmati rice' }], steps: ['Sauté onion, garlic with curry powder over medium heat 3 min until fragrant.', 'Add tomatoes and chickpeas.', 'Pour in coconut milk and simmer over low heat 20 min.', 'Serve over rice.'] },
  { id: '28', icon: '🍝', name: 'Turkey Meatballs', diet: 'High Protein', meal: 'Dinner', kcal: 420, carbs: 30, protein: 48, fat: 12, time: '35 min', goal: 'muscle_gain', ingredients: [{ qty: '250g', name: 'Ground turkey' }, { qty: '30g', name: 'Breadcrumbs' }, { qty: '1 piece', name: 'Egg' }, { qty: '20g', name: 'Parmesan' }, { qty: '150ml', name: 'Marinara sauce' }, { qty: '100g (dry)', name: 'Spaghetti' }], steps: ['Mix turkey with breadcrumbs, egg, parmesan.', 'Form into balls.', 'Bake at 190C for 20 min.', 'Simmer meatballs over low heat in marinara sauce 5 min to coat.', 'Serve over pasta.'] },
  { id: '29', icon: '🥬', name: 'Stuffed Bell Peppers', diet: 'Vegetarian', meal: 'Dinner', kcal: 320, carbs: 38, protein: 16, fat: 10, time: '40 min', goal: 'balanced', ingredients: [{ qty: '2 pieces', name: 'Bell peppers' }, { qty: '80g (dry)', name: 'Quinoa' }, { qty: '100g (cooked)', name: 'Black beans' }, { qty: '100g', name: 'Tomatoes' }, { qty: '60g', name: 'Corn' }, { qty: '1 tsp', name: 'Cumin' }, { qty: '30g', name: 'Cheese' }], steps: ['Cook quinoa with cumin.', 'Mix with beans, tomatoes, corn.', 'Hollow out peppers and fill.', 'Top with cheese.', 'Bake at 180C for 25 min.'] },
  { id: '30', icon: '🍝', name: 'Pasta Primavera', diet: 'Vegetarian', meal: 'Dinner', kcal: 440, carbs: 68, protein: 14, fat: 12, time: '25 min', goal: 'balanced', ingredients: [{ qty: '100g (dry)', name: 'Penne pasta' }, { qty: '100g', name: 'Cherry tomatoes' }, { qty: '100g', name: 'Zucchini' }, { qty: '80g', name: 'Asparagus' }, { qty: '2 tbsp (30ml)', name: 'Olive oil' }, { qty: '30g', name: 'Parmesan' }, { qty: '10g', name: 'Fresh basil' }], steps: ['Boil pasta in salted water until al dente — taste a piece 1 min before package time, it should be tender with a slight bite in the centre.', 'Sauté vegetables in olive oil over medium heat 4–5 min until tender-crisp.', 'Toss pasta with vegetables.', 'Add parmesan and fresh basil.'] },
  { id: '31', icon: '🍛', name: 'Thai Green Curry', diet: 'High Protein', meal: 'Dinner', kcal: 460, carbs: 38, protein: 36, fat: 18, time: '30 min', goal: 'muscle_gain', ingredients: [{ qty: '200g', name: 'Chicken breast' }, { qty: '2 tbsp (30g)', name: 'Green curry paste' }, { qty: '250ml', name: 'Coconut milk' }, { qty: '80g', name: 'Bamboo shoots' }, { qty: '10g', name: 'Fresh basil' }, { qty: '100g (dry)', name: 'Jasmine rice' }], steps: ['Fry curry paste over medium heat 1 min.', 'Add coconut milk and simmer over low heat 5 min.', 'Add chicken pieces and cook over medium heat 8–10 min until 75°C internal.', 'Add bamboo shoots and basil.', 'Serve over jasmine rice.'] },
  { id: '32', icon: '🫘', name: 'Kidney Bean Chili', diet: 'Vegan', meal: 'Dinner', kcal: 350, carbs: 54, protein: 16, fat: 6, time: '35 min', goal: 'balanced', ingredients: [{ qty: '200g (cooked)', name: 'Kidney beans' }, { qty: '200g', name: 'Chopped tomatoes' }, { qty: '1 medium (100g)', name: 'Onion' }, { qty: '2 tsp (6g)', name: 'Chili powder' }, { qty: '1 tsp', name: 'Cumin' }, { qty: '100g', name: 'Bell pepper' }, { qty: '1 piece', name: 'Cornbread' }], steps: ['Sauté onion and peppers over medium heat 5 min until softened.', 'Add spices and cook 1 min.', 'Add beans and tomatoes.', 'Simmer over low heat 25 min.', 'Serve with cornbread.'] },
  // Snacks
  { id: '33', icon: '🍏', name: 'Apple & Almond Butter', diet: 'Vegan', meal: 'Snack', kcal: 190, carbs: 26, protein: 4, fat: 10, time: '2 min', goal: 'balanced', ingredients: [{ qty: '1 medium (180g)', name: 'Apple' }, { qty: '2 tbsp (32g)', name: 'Almond butter' }], steps: ['Slice apple.', 'Serve with 2 tbsp almond butter for dipping.'] },
  { id: '34', icon: '🥜', name: 'Trail Mix', diet: 'Vegan', meal: 'Snack', kcal: 210, carbs: 18, protein: 6, fat: 14, time: '1 min', goal: 'muscle_gain', ingredients: [{ qty: '40g', name: 'Mixed nuts' }, { qty: '20g', name: 'Dried cranberries' }, { qty: '10g', name: 'Dark chocolate chips' }, { qty: '15g', name: 'Pumpkin seeds' }], steps: ['Mix all ingredients together.', 'Store in a container.'] },
  { id: '35', icon: '🧀', name: 'Cottage Cheese & Berries', diet: 'Vegetarian', meal: 'Snack', kcal: 160, carbs: 16, protein: 18, fat: 3, time: '2 min', goal: 'weight_loss', ingredients: [{ qty: '200g', name: 'Cottage cheese' }, { qty: '80g', name: 'Mixed berries' }, { qty: '1 tsp (7ml)', name: 'Honey' }], steps: ['Spoon cottage cheese into a bowl.', 'Top with berries and a drizzle of honey.'] },
  { id: '36', icon: '🥒', name: 'Hummus & Veggies', diet: 'Vegan', meal: 'Snack', kcal: 140, carbs: 16, protein: 6, fat: 7, time: '5 min', goal: 'weight_loss', ingredients: [{ qty: '4 tbsp (80g)', name: 'Hummus' }, { qty: '100g', name: 'Cucumber' }, { qty: '80g', name: 'Carrot sticks' }, { qty: '80g', name: 'Bell pepper strips' }, { qty: '60g', name: 'Celery' }], steps: ['Cut vegetables into sticks.', 'Serve with hummus for dipping.'] },
  { id: '37', icon: '🍫', name: 'Protein Energy Balls', diet: 'Vegetarian', meal: 'Snack', kcal: 180, carbs: 22, protein: 8, fat: 7, time: '15 min', goal: 'muscle_gain', ingredients: [{ qty: '80g', name: 'Oats' }, { qty: '3 tbsp (48g)', name: 'Peanut butter' }, { qty: '2 tbsp (40ml)', name: 'Honey' }, { qty: '1 scoop (30g)', name: 'Protein powder' }, { qty: '20g', name: 'Dark chocolate chips' }], steps: ['Mix all ingredients together.', 'Roll into balls.', 'Refrigerate for 30 min to firm up.'] },
  { id: '38', icon: '🫐', name: 'Blueberry Chia Pudding', diet: 'Vegan', meal: 'Snack', kcal: 200, carbs: 28, protein: 6, fat: 8, time: '5 min', goal: 'balanced', ingredients: [{ qty: '3 tbsp (30g)', name: 'Chia seeds' }, { qty: '250ml', name: 'Almond milk' }, { qty: '80g', name: 'Blueberries' }, { qty: '1 tbsp (15ml)', name: 'Maple syrup' }, { qty: '½ tsp (2ml)', name: 'Vanilla extract' }], steps: ['Mix chia seeds with almond milk.', 'Add maple syrup and vanilla.', 'Refrigerate overnight.', 'Top with blueberries.'] },
  // High Protein extras
  { id: '39', icon: '🥩', name: 'Steak & Roasted Veg', diet: 'High Protein', meal: 'Dinner', kcal: 520, carbs: 20, protein: 52, fat: 26, time: '30 min', goal: 'muscle_gain', ingredients: [{ qty: '250g', name: 'Sirloin steak' }, { qty: '150g', name: 'Sweet potato' }, { qty: '150g', name: 'Broccoli' }, { qty: '2 tbsp (30ml)', name: 'Olive oil' }, { qty: '1 sprig', name: 'Rosemary' }, { qty: '2 cloves', name: 'Garlic' }], steps: ['Roast sweet potato and broccoli at 200C.', 'Season steak and sear over high heat 3–4 min per side for medium-rare.', 'Rest steak 5 min before slicing.', 'Serve with roasted vegetables.'] },
  { id: '40', icon: '🐟', name: 'Tuna Stuffed Avocado', diet: 'Keto', meal: 'Lunch', kcal: 340, carbs: 8, protein: 28, fat: 22, time: '10 min', goal: 'weight_loss', ingredients: [{ qty: '150g', name: 'Canned tuna' }, { qty: '1 medium (200g)', name: 'Avocado' }, { qty: '1 tbsp (15ml)', name: 'Lemon juice' }, { qty: '30g', name: 'Red onion' }, { qty: '40g', name: 'Celery' }, { qty: '1 tsp', name: 'Dijon mustard' }], steps: ['Mix tuna with lemon, onion, celery, mustard.', 'Halve avocado and remove pit.', 'Fill avocado halves with tuna mixture.'] },
  { id: '41', icon: '🍳', name: 'Shakshuka', diet: 'Vegetarian', meal: 'Breakfast', kcal: 290, carbs: 18, protein: 18, fat: 16, time: '25 min', goal: 'balanced', ingredients: [{ qty: '2 pieces', name: 'Eggs' }, { qty: '200g', name: 'Canned tomatoes' }, { qty: '80g', name: 'Bell pepper' }, { qty: '60g', name: 'Onion' }, { qty: '1 tbsp (15ml)', name: 'Olive oil' }, { qty: '½ tsp', name: 'Cumin' }, { qty: '½ tsp', name: 'Paprika' }, { qty: '30g', name: 'Feta' }], steps: ['Sauté onion and pepper in olive oil over medium heat 5 min until softened.', 'Add spices and tomatoes, simmer over low heat 10 min.', 'Make wells and crack eggs in.', 'Cover and cook over low heat 5–7 min until whites set but yolks still runny.', 'Top with feta.'] },
  { id: '42', icon: '🥗', name: 'Edamame Salad', diet: 'Vegan', meal: 'Lunch', kcal: 310, carbs: 28, protein: 18, fat: 14, time: '10 min', goal: 'balanced', ingredients: [{ qty: '120g', name: 'Edamame' }, { qty: '100g', name: 'Red cabbage' }, { qty: '80g', name: 'Mango' }, { qty: '10g', name: 'Cilantro' }, { qty: '2 tbsp (30ml)', name: 'Sesame dressing' }, { qty: '1 tsp', name: 'Sesame seeds' }], steps: ['Cook edamame and cool.', 'Shred cabbage and cube mango.', 'Toss with cilantro and sesame dressing.', 'Top with sesame seeds.'] },
  { id: '43', icon: '🍗', name: 'Chicken Shawarma Bowl', diet: 'High Protein', meal: 'Dinner', kcal: 490, carbs: 42, protein: 48, fat: 14, time: '35 min', goal: 'muscle_gain', ingredients: [{ qty: '200g', name: 'Chicken thighs' }, { qty: '1 tsp', name: 'Cumin' }, { qty: '½ tsp', name: 'Turmeric' }, { qty: '1 tsp', name: 'Paprika' }, { qty: '1 piece (75g)', name: 'Pita' }, { qty: '2 tbsp (30ml)', name: 'Tahini' }, { qty: '100g', name: 'Tomato' }, { qty: '10g', name: 'Parsley' }], steps: ['Slice chicken thighs into 1.5cm thick strips — thighs are already tender so no pounding needed.', 'Toss strips with cumin, turmeric, paprika, and a drizzle of olive oil until fully coated. Cover bowl with cling wrap and refrigerate overnight (or at least 2 hours) — longer marinating = deeper flavour.', 'Grill or pan cook chicken over medium-high heat 6–7 min per side until 75°C internal.', 'Slice and serve in bowl with pita.', 'Drizzle tahini and add tomato and parsley.'] },
  { id: '44', icon: '🍲', name: 'White Bean Soup', diet: 'Vegan', meal: 'Dinner', kcal: 290, carbs: 44, protein: 14, fat: 6, time: '30 min', goal: 'balanced', ingredients: [{ qty: '200g (cooked)', name: 'White beans' }, { qty: '60g', name: 'Kale' }, { qty: '80g', name: 'Carrots' }, { qty: '60g', name: 'Celery' }, { qty: '3 cloves', name: 'Garlic' }, { qty: '1 tbsp (15ml)', name: 'Olive oil' }, { qty: '500ml', name: 'Vegetable broth' }, { qty: '1 sprig', name: 'Rosemary' }], steps: ['Sauté carrots, celery, garlic in olive oil over medium heat 5 min until softened.', 'Add beans, broth, rosemary.', 'Simmer over low heat 20 min.', 'Add kale and cook over low heat 5 min more.'] },
  { id: '45', icon: '🥑', name: 'Keto Avocado Salad', diet: 'Keto', meal: 'Lunch', kcal: 360, carbs: 10, protein: 14, fat: 30, time: '10 min', goal: 'weight_loss', ingredients: [{ qty: '1 medium (200g)', name: 'Avocado' }, { qty: '100g', name: 'Cherry tomatoes' }, { qty: '100g', name: 'Cucumber' }, { qty: '50g', name: 'Feta' }, { qty: '2 tbsp (30ml)', name: 'Olive oil' }, { qty: '½ piece', name: 'Lemon' }, { qty: '5g', name: 'Fresh basil' }], steps: ['Cube avocado and combine with tomatoes.', 'Add cucumber and feta.', 'Dress with olive oil and lemon.', 'Top with fresh basil.'] },
  { id: '46', icon: '🦐', name: 'Shrimp Tacos', diet: 'High Protein', meal: 'Dinner', kcal: 400, carbs: 36, protein: 38, fat: 12, time: '20 min', goal: 'muscle_gain', ingredients: [{ qty: '200g', name: 'Shrimp' }, { qty: '3 pieces', name: 'Corn tortillas' }, { qty: '80g', name: 'Cabbage slaw' }, { qty: '½ piece', name: 'Lime' }, { qty: '10g', name: 'Cilantro' }, { qty: '2 tbsp (30ml)', name: 'Sriracha mayo' }], steps: ['Season and saute shrimp over medium-high heat 2 min each side.', 'Warm tortillas.', 'Fill with shrimp and cabbage slaw.', 'Drizzle with sriracha mayo and lime juice.'] },
  { id: '47', icon: '🥒', name: 'Stuffed Zucchini Boats', diet: 'Low Carb', meal: 'Dinner', kcal: 310, carbs: 14, protein: 28, fat: 16, time: '35 min', goal: 'weight_loss', ingredients: [{ qty: '2 medium (400g)', name: 'Zucchini' }, { qty: '150g', name: 'Ground beef' }, { qty: '100ml', name: 'Tomato sauce' }, { qty: '40g', name: 'Mozzarella' }, { qty: '60g', name: 'Onion' }, { qty: '2 cloves', name: 'Garlic' }], steps: ['Halve zucchini and scoop centers.', 'Brown beef over medium heat with onion and garlic 5–6 min until no pink remains.', 'Add tomato sauce and fill zucchini.', 'Top with mozzarella.', 'Bake at 190C for 20 min.'] },
  { id: '48', icon: '🥘', name: 'Paella de Verduras', diet: 'Vegan', meal: 'Dinner', kcal: 410, carbs: 72, protein: 10, fat: 8, time: '40 min', goal: 'balanced', ingredients: [{ qty: '150g (dry)', name: 'Bomba rice' }, { qty: '150g', name: 'Bell peppers' }, { qty: '100g', name: 'Artichokes' }, { qty: '150g', name: 'Tomatoes' }, { qty: '2 tbsp (30ml)', name: 'Olive oil' }, { qty: '0.5g', name: 'Saffron' }, { qty: '1 tsp', name: 'Smoked paprika' }, { qty: '400ml', name: 'Vegetable broth' }], steps: ['Fry peppers, tomatoes, and artichokes in olive oil in a wide pan over medium heat.', 'Add rice and spices, stir.', 'Pour broth over and simmer over low heat 20 min until absorbed (no stirring).', 'Let rest 5 min before serving.'] },
  { id: '49', icon: '🥗', name: 'Spinach Lentil Salad', diet: 'Vegan', meal: 'Lunch', kcal: 340, carbs: 44, protein: 18, fat: 10, time: '20 min', goal: 'balanced', ingredients: [{ qty: '100g (dry)', name: 'Green lentils' }, { qty: '80g', name: 'Spinach' }, { qty: '40g', name: 'Red onion' }, { qty: '80g', name: 'Cherry tomatoes' }, { qty: '1 piece', name: 'Lemon' }, { qty: '2 tbsp (30ml)', name: 'Olive oil' }, { qty: '½ tsp', name: 'Cumin' }], steps: ['Cook lentils in simmering water 25–30 min until tender.', 'Cool slightly.', 'Toss with spinach, tomatoes, red onion.', 'Dress with lemon, olive oil, cumin.'] },
  { id: '50', icon: '🍣', name: 'Sushi Bowl', diet: 'High Protein', meal: 'Dinner', kcal: 470, carbs: 58, protein: 34, fat: 10, time: '20 min', goal: 'balanced', ingredients: [{ qty: '100g (dry)', name: 'Sushi rice' }, { qty: '150g', name: 'Salmon' }, { qty: '½ medium (75g)', name: 'Avocado' }, { qty: '80g', name: 'Cucumber' }, { qty: '2 tbsp (30ml)', name: 'Soy sauce' }, { qty: '1 tbsp (15ml)', name: 'Rice vinegar' }, { qty: '1 tsp', name: 'Sesame seeds' }, { qty: '1 sheet', name: 'Nori' }], steps: ['Cook sushi rice with rice vinegar.', 'Slice salmon.', 'Assemble bowl with rice, salmon, avocado, cucumber.', 'Drizzle soy sauce and add sesame seeds.', 'Shred nori on top.'] },
  { id: '51', icon: '🫛', name: 'Edamame & Brown Rice', diet: 'Vegan', meal: 'Lunch', kcal: 330, carbs: 54, protein: 14, fat: 6, time: '20 min', goal: 'balanced', ingredients: [{ qty: '100g (dry)', name: 'Brown rice' }, { qty: '100g', name: 'Edamame' }, { qty: '2 tbsp (30ml)', name: 'Soy sauce' }, { qty: '1 tsp (5ml)', name: 'Sesame oil' }, { qty: '10g', name: 'Green onion' }, { qty: '1 tsp (5g)', name: 'Ginger' }], steps: ['Cook brown rice.', 'Steam edamame.', 'Mix rice with soy sauce, sesame oil, ginger.', 'Top with edamame and green onion.'] },
  { id: '52', icon: '🍔', name: 'Turkey Burger (No Bun)', diet: 'Low Carb', meal: 'Dinner', kcal: 380, carbs: 8, protein: 44, fat: 18, time: '20 min', goal: 'weight_loss', ingredients: [{ qty: '200g', name: 'Ground turkey' }, { qty: '2 leaves', name: 'Lettuce wrap' }, { qty: '1 medium (120g)', name: 'Tomato' }, { qty: '40g', name: 'Onion' }, { qty: '1 tsp', name: 'Mustard' }, { qty: '½ medium (75g)', name: 'Avocado' }], steps: ['Season turkey and form into patty.', 'Cook in pan over medium heat 5 min each side.', 'Serve in lettuce wrap with toppings.'] },
  { id: '53', icon: '🥦', name: 'Broccoli Cheddar Frittata', diet: 'Keto', meal: 'Breakfast', kcal: 300, carbs: 4, protein: 24, fat: 22, time: '20 min', goal: 'weight_loss', ingredients: [{ qty: '3 pieces', name: 'Eggs' }, { qty: '150g', name: 'Broccoli florets' }, { qty: '40g', name: 'Cheddar cheese' }, { qty: '30ml', name: 'Cream' }, { qty: '60g', name: 'Onion' }, { qty: '1 tbsp (14g)', name: 'Butter' }, { qty: '¼ tsp', name: 'Salt' }, { qty: '¼ tsp', name: 'Pepper' }], steps: ['Blanch broccoli in boiling water 2 min, then drain.', 'Melt butter and sauté onion over medium heat 3 min until translucent, add broccoli.', 'Pour whisked eggs and cream over.', 'Top with cheddar.', 'Bake at 180C for 15 min.'] },
  { id: '54', icon: '🥦', name: 'Cauliflower Rice Bowl', diet: 'Keto', meal: 'Lunch', kcal: 290, carbs: 12, protein: 20, fat: 18, time: '15 min', goal: 'weight_loss', ingredients: [{ qty: '250g', name: 'Cauliflower' }, { qty: '150g', name: 'Ground beef' }, { qty: '60g', name: 'Onion' }, { qty: '2 cloves', name: 'Garlic' }, { qty: '2 tbsp (30ml)', name: 'Soy sauce' }, { qty: '1 tsp (5ml)', name: 'Sesame oil' }, { qty: '10g', name: 'Green onion' }], steps: ['Pulse cauliflower into rice-sized pieces.', 'Fry beef over medium-high heat with onion and garlic 5–6 min until browned.', 'Add cauliflower rice and stir-fry over high heat 3–4 min until tender.', 'Season with soy sauce and sesame oil.'] },
  { id: '55', icon: '🥝', name: 'Green Detox Smoothie', diet: 'Vegan', meal: 'Breakfast', kcal: 220, carbs: 42, protein: 6, fat: 4, time: '5 min', goal: 'weight_loss', ingredients: [{ qty: '60g', name: 'Spinach' }, { qty: '1 medium (80g)', name: 'Kiwi' }, { qty: '1 medium (180g)', name: 'Apple' }, { qty: '80g', name: 'Cucumber' }, { qty: '½ piece (30ml)', name: 'Lemon juice' }, { qty: '1 tsp (5g)', name: 'Ginger' }, { qty: '200ml', name: 'Water' }], steps: ['Add all ingredients to blender.', 'Blend until smooth.', 'If too thick to drink, add water 1 tbsp at a time and blend again.', 'Serve immediately.'] },
  { id: '56', icon: '🍠', name: 'Sweet Potato Hash', diet: 'Vegetarian', meal: 'Breakfast', kcal: 330, carbs: 50, protein: 10, fat: 10, time: '20 min', goal: 'balanced', ingredients: [{ qty: '1 large (300g)', name: 'Sweet potato' }, { qty: '2 pieces', name: 'Eggs' }, { qty: '80g', name: 'Bell pepper' }, { qty: '60g', name: 'Onion' }, { qty: '1 tsp', name: 'Smoked paprika' }, { qty: '1 tbsp (15ml)', name: 'Olive oil' }], steps: ['Dice and cook sweet potato over medium heat 8–10 min until fork-tender.', 'Add onion and peppers.', 'Make wells and add eggs.', 'Cover and cook over low heat until eggs set.'] },
  { id: '57', icon: '🍤', name: 'Garlic Butter Shrimp', diet: 'High Protein', meal: 'Dinner', kcal: 320, carbs: 4, protein: 42, fat: 14, time: '15 min', goal: 'weight_loss', ingredients: [{ qty: '200g', name: 'Shrimp' }, { qty: '1 tbsp (14g)', name: 'Butter' }, { qty: '3 cloves', name: 'Garlic' }, { qty: '½ piece (30ml)', name: 'Lemon juice' }, { qty: '10g', name: 'Parsley' }, { qty: '¼ tsp', name: 'Red pepper flakes' }], steps: ['Melt butter in pan over high heat.', 'Add garlic and pepper flakes.', 'Add shrimp and cook 1-2 min per side.', 'Squeeze lemon and add parsley.'] },
  { id: '58', icon: '🫕', name: 'Veggie Soup', diet: 'Vegan', meal: 'Lunch', kcal: 180, carbs: 30, protein: 6, fat: 4, time: '30 min', goal: 'weight_loss', ingredients: [{ qty: '500ml', name: 'Vegetable broth' }, { qty: '100g', name: 'Carrots' }, { qty: '80g', name: 'Celery' }, { qty: '100g', name: 'Zucchini' }, { qty: '100g', name: 'Tomatoes' }, { qty: '1 medium (100g)', name: 'Onion' }, { qty: '1 tbsp (15ml)', name: 'Olive oil' }, { qty: '1 tsp', name: 'Thyme' }, { qty: '1 piece', name: 'Bay leaf' }], steps: ['Sauté onion, carrots, celery in olive oil over medium heat 5 min until softened.', 'Add broth, tomatoes, zucchini.', 'Add thyme and bay leaf.', 'Simmer over low heat 20 min.'] },
  { id: '59', icon: '🥗', name: 'Watermelon Feta Salad', diet: 'Vegetarian', meal: 'Snack', kcal: 180, carbs: 22, protein: 6, fat: 8, time: '5 min', goal: 'balanced', ingredients: [{ qty: '300g', name: 'Watermelon' }, { qty: '50g', name: 'Feta cheese' }, { qty: '5g', name: 'Fresh mint' }, { qty: '30g', name: 'Red onion' }, { qty: '½ piece', name: 'Lime' }, { qty: '¼ tsp', name: 'Black pepper' }], steps: ['Cube watermelon.', 'Crumble feta over top.', 'Add thinly sliced red onion.', 'Squeeze lime and add mint leaves.'] },
  { id: '60', icon: '🥙', name: 'Mediterranean Plate', diet: 'Mediterranean', meal: 'Lunch', kcal: 450, carbs: 38, protein: 18, fat: 24, time: '10 min', goal: 'balanced', ingredients: [{ qty: '1 piece (75g)', name: 'Pita bread' }, { qty: '4 tbsp (80g)', name: 'Hummus' }, { qty: '80g', name: 'Tabbouleh' }, { qty: '30g', name: 'Olives' }, { qty: '3 pieces', name: 'Dolmades' }, { qty: '80g', name: 'Cucumber' }, { qty: '40g', name: 'Feta' }], steps: ['Warm pita bread.', 'Arrange hummus, tabbouleh, olives, and dolmades.', 'Add cucumber and feta.', 'Serve immediately.'] },

  // ── Breakfast extras ────────────────────────────────────────────────────────
  { id: '61', icon: '🥣', name: 'Bircher Muesli', diet: 'Vegetarian', meal: 'Breakfast', kcal: 360, carbs: 58, protein: 12, fat: 9, time: '5 min', goal: 'balanced', ingredients: [{ qty: '80g', name: 'Rolled oats' }, { qty: '200ml', name: 'Milk' }, { qty: '1 medium (120g)', name: 'Apple (grated)' }, { qty: '1 tbsp (15g)', name: 'Honey' }, { qty: '30g', name: 'Mixed nuts' }, { qty: '80g', name: 'Mixed berries' }], steps: ['Soak oats in milk overnight in fridge.', 'In the morning, grate apple into oats.', 'Add honey and stir well.', 'Top with nuts and berries.'] },
  { id: '62', icon: '🍞', name: 'French Toast', diet: 'Vegetarian', meal: 'Breakfast', kcal: 320, carbs: 40, protein: 16, fat: 10, time: '12 min', goal: 'balanced', ingredients: [{ qty: '2 slices (80g)', name: 'Brioche bread' }, { qty: '2 pieces', name: 'Eggs' }, { qty: '60ml', name: 'Milk' }, { qty: '½ tsp', name: 'Cinnamon' }, { qty: '1 tsp', name: 'Vanilla extract' }, { qty: '1 tsp (5g)', name: 'Butter' }, { qty: '1 tbsp (20ml)', name: 'Maple syrup' }], steps: ['Whisk eggs with milk, cinnamon, and vanilla.', 'Dip bread slices in egg mixture.', 'Melt butter in pan over medium heat.', 'Cook 2–3 min each side until golden.', 'Serve with maple syrup.'] },
  { id: '63', icon: '🍵', name: 'Vanilla Chia Pudding', diet: 'Vegan', meal: 'Breakfast', kcal: 280, carbs: 32, protein: 8, fat: 12, time: '5 min', goal: 'balanced', ingredients: [{ qty: '3 tbsp (30g)', name: 'Chia seeds' }, { qty: '250ml', name: 'Coconut milk' }, { qty: '1 tsp', name: 'Vanilla extract' }, { qty: '1 tbsp (15ml)', name: 'Maple syrup' }, { qty: '100g', name: 'Mango chunks' }, { qty: '20g', name: 'Toasted coconut flakes' }], steps: ['Mix chia seeds with coconut milk, vanilla, and maple syrup.', 'Stir well and refrigerate overnight.', 'Top with mango and toasted coconut.'] },
  { id: '64', icon: '🥓', name: 'Keto Breakfast Plate', diet: 'Keto', meal: 'Breakfast', kcal: 420, carbs: 4, protein: 30, fat: 32, time: '15 min', goal: 'weight_loss', ingredients: [{ qty: '3 pieces', name: 'Eggs' }, { qty: '80g', name: 'Bacon' }, { qty: '½ medium (75g)', name: 'Avocado' }, { qty: '80g', name: 'Cherry tomatoes' }, { qty: '¼ tsp', name: 'Salt' }, { qty: '¼ tsp', name: 'Pepper' }], steps: ['Fry bacon over medium heat 5–7 min until crispy, set aside.', 'Crack eggs into the bacon fat and cook over medium heat — 2 min for runny yolk (sunny-side up), 3 min for jammy yolk, 4 min for fully set. Cover the pan with a lid for the last 30 sec to set the whites without flipping.', 'Serve with sliced avocado and cherry tomatoes.', 'Season with salt and pepper.'] },
  { id: '65', icon: '🫙', name: 'Açaí Bowl', diet: 'Vegan', meal: 'Breakfast', kcal: 340, carbs: 52, protein: 7, fat: 12, time: '5 min', goal: 'balanced', ingredients: [{ qty: '100g', name: 'Frozen açaí puree' }, { qty: '1 medium (120g)', name: 'Banana' }, { qty: '80ml', name: 'Almond milk' }, { qty: '30g', name: 'Granola' }, { qty: '60g', name: 'Strawberries' }, { qty: '1 tsp (7ml)', name: 'Honey' }, { qty: '1 tbsp (10g)', name: 'Chia seeds' }], steps: ['Blend açaí, banana, and almond milk until thick.', 'Pour into bowl.', 'Top with granola, strawberries, chia seeds.', 'Drizzle with honey.'] },
  { id: '66', icon: '🥞', name: 'Banana Oat Pancakes', diet: 'Vegan', meal: 'Breakfast', kcal: 290, carbs: 52, protein: 8, fat: 6, time: '15 min', goal: 'balanced', ingredients: [{ qty: '1 large (140g)', name: 'Ripe banana' }, { qty: '80g', name: 'Rolled oats (blended)' }, { qty: '150ml', name: 'Oat milk' }, { qty: '1 tsp', name: 'Baking powder' }, { qty: '1 tsp', name: 'Cinnamon' }, { qty: '80g', name: 'Mixed berries' }], steps: ['Mash banana thoroughly.', 'Mix in blended oats, milk, baking powder, and cinnamon.', 'Cook in non-stick pan over medium heat 2–3 min each side.', 'Top with berries.'] },
  { id: '67', icon: '🧇', name: 'Protein Waffles', diet: 'High Protein', meal: 'Breakfast', kcal: 380, carbs: 36, protein: 32, fat: 12, time: '15 min', goal: 'muscle_gain', ingredients: [{ qty: '1 scoop (30g)', name: 'Vanilla protein powder' }, { qty: '80g', name: 'Oat flour' }, { qty: '2 pieces', name: 'Eggs' }, { qty: '150ml', name: 'Almond milk' }, { qty: '1 tsp', name: 'Baking powder' }, { qty: '1 tbsp (20ml)', name: 'Honey' }, { qty: '100g', name: 'Greek yogurt (side)' }], steps: ['Mix protein powder, oat flour, and baking powder.', 'Add eggs, milk, and honey; stir until smooth.', 'Cook in preheated waffle maker.', 'Serve with Greek yogurt.'] },
  { id: '68', icon: '🍌', name: 'Almond Banana Smoothie', diet: 'Vegan', meal: 'Breakfast', kcal: 330, carbs: 48, protein: 10, fat: 12, time: '5 min', goal: 'balanced', ingredients: [{ qty: '1 large (140g)', name: 'Frozen banana' }, { qty: '2 tbsp (32g)', name: 'Almond butter' }, { qty: '250ml', name: 'Oat milk' }, { qty: '1 tbsp (10g)', name: 'Hemp seeds' }, { qty: '½ tsp', name: 'Cinnamon' }, { qty: '1 tsp (7ml)', name: 'Maple syrup' }], steps: ['Add all ingredients to a blender.', 'Blend until completely smooth.', 'Serve immediately.'] },
  { id: '69', icon: '🥚', name: 'Huevos Rancheros', diet: 'Vegetarian', meal: 'Breakfast', kcal: 380, carbs: 34, protein: 20, fat: 18, time: '20 min', goal: 'balanced', ingredients: [{ qty: '2 pieces', name: 'Corn tortillas' }, { qty: '2 pieces', name: 'Eggs' }, { qty: '150g (cooked)', name: 'Black beans' }, { qty: '4 tbsp (60ml)', name: 'Salsa' }, { qty: '½ medium (75g)', name: 'Avocado' }, { qty: '10g', name: 'Cilantro' }, { qty: '1 tbsp (15ml)', name: 'Olive oil' }], steps: ['Warm tortillas in dry pan.', 'Heat beans with salsa over medium heat 3 min until warmed through.', 'Crack eggs into the oil and cook over medium heat — 2 min for runny yolk, 3 min for jammy, 4 min for fully set. Cover the pan with a lid for the last 30 sec to set the whites.', 'Assemble: tortillas, beans, egg.', 'Top with avocado and cilantro.'] },
  { id: '70', icon: '🥥', name: 'Coconut Yogurt Bowl', diet: 'Vegan', meal: 'Breakfast', kcal: 310, carbs: 42, protein: 6, fat: 14, time: '5 min', goal: 'balanced', ingredients: [{ qty: '200g', name: 'Coconut yogurt' }, { qty: '40g', name: 'Granola' }, { qty: '80g', name: 'Passion fruit pulp' }, { qty: '60g', name: 'Pineapple chunks' }, { qty: '1 tbsp (15ml)', name: 'Honey' }, { qty: '20g', name: 'Toasted coconut flakes' }], steps: ['Spoon yogurt into a bowl.', 'Top with granola, passion fruit, and pineapple.', 'Drizzle with honey and scatter coconut flakes.'] },

  // ── Lunch extras ────────────────────────────────────────────────────────────
  { id: '71', icon: '🌮', name: 'Fish Tacos', diet: 'High Protein', meal: 'Lunch', kcal: 400, carbs: 36, protein: 36, fat: 14, time: '20 min', goal: 'muscle_gain', ingredients: [{ qty: '200g', name: 'White fish fillet' }, { qty: '3 pieces', name: 'Corn tortillas' }, { qty: '80g', name: 'Red cabbage slaw' }, { qty: '3 tbsp (45ml)', name: 'Chipotle mayo' }, { qty: '½ piece', name: 'Lime' }, { qty: '10g', name: 'Cilantro' }, { qty: '1 tsp', name: 'Cumin' }, { qty: '¼ tsp', name: 'Salt' }, { qty: '¼ tsp', name: 'Pepper' }], steps: ['Season fish with cumin, salt, pepper.', 'Pan-fry over medium-high heat 3–4 min each side.', 'Flake fish and fill warmed tortillas.', 'Top with slaw, chipotle mayo, lime, and cilantro.'] },
  { id: '72', icon: '🍅', name: 'Caprese Salad', diet: 'Vegetarian', meal: 'Lunch', kcal: 280, carbs: 10, protein: 14, fat: 22, time: '5 min', goal: 'balanced', ingredients: [{ qty: '250g', name: 'Heirloom tomatoes' }, { qty: '150g', name: 'Fresh mozzarella' }, { qty: '10g', name: 'Fresh basil' }, { qty: '3 tbsp (45ml)', name: 'Extra virgin olive oil' }, { qty: '1 tbsp (15ml)', name: 'Balsamic glaze' }, { qty: '¼ tsp', name: 'Sea salt' }], steps: ['Slice tomatoes and mozzarella to similar thickness.', 'Alternate layers on a plate.', 'Tuck basil between layers.', 'Drizzle with olive oil and balsamic glaze.', 'Season and serve immediately.'] },
  { id: '73', icon: '🍣', name: 'Poke Bowl', diet: 'High Protein', meal: 'Lunch', kcal: 480, carbs: 54, protein: 36, fat: 14, time: '15 min', goal: 'muscle_gain', ingredients: [{ qty: '150g', name: 'Sushi-grade tuna' }, { qty: '100g (dry)', name: 'Sushi rice' }, { qty: '½ medium (75g)', name: 'Avocado' }, { qty: '80g', name: 'Edamame' }, { qty: '60g', name: 'Cucumber' }, { qty: '3 tbsp (45ml)', name: 'Ponzu sauce' }, { qty: '1 tsp', name: 'Sesame seeds' }], steps: ['Cook and season sushi rice.', 'Cut tuna into 2cm cubes (use a sharp knife and confident strokes — don\'t saw). Toss with ponzu sauce and refrigerate 10–15 min max — the acid in ponzu starts cooking the fish, so don\'t leave it longer.', 'Build bowl with rice, tuna, avocado, edamame.', 'Add cucumber and sprinkle sesame seeds.'] },
  { id: '74', icon: '🍜', name: 'Pad Thai', diet: 'High Protein', meal: 'Lunch', kcal: 460, carbs: 56, protein: 28, fat: 14, time: '20 min', goal: 'balanced', ingredients: [{ qty: '100g (dry)', name: 'Rice noodles' }, { qty: '150g', name: 'Chicken or tofu' }, { qty: '2 pieces', name: 'Eggs' }, { qty: '80g', name: 'Bean sprouts' }, { qty: '3 tbsp (45ml)', name: 'Pad Thai sauce' }, { qty: '20g', name: 'Peanuts (crushed)' }, { qty: '½ piece', name: 'Lime' }], steps: ['Soak noodles in hot water 8 min, drain.', 'Cut chicken into 1.5cm cubes (or pat tofu dry and cube). Stir-fry in hot wok over high heat 3 min — chicken should be opaque with no pink, tofu should have golden edges.', 'Push aside, scramble eggs in.', 'Add noodles and pad thai sauce; toss.', 'Top with sprouts, peanuts, and lime.'] },
  { id: '75', icon: '🥙', name: 'Chicken Shawarma Wrap', diet: 'High Protein', meal: 'Lunch', kcal: 440, carbs: 40, protein: 44, fat: 12, time: '20 min', goal: 'muscle_gain', ingredients: [{ qty: '180g', name: 'Chicken breast' }, { qty: '1 piece (65g)', name: 'Whole wheat tortilla' }, { qty: '3 tbsp (45ml)', name: 'Garlic sauce' }, { qty: '60g', name: 'Lettuce' }, { qty: '80g', name: 'Tomato' }, { qty: '½ piece', name: 'Lemon' }, { qty: '1 tsp', name: 'Shawarma spice blend' }], steps: ['Slice chicken breast horizontally through the middle to make two 1cm-thin fillets (lay your palm flat on top and slice parallel to the cutting board) — thin fillets cook in half the time and soak up the marinade better.', 'Rub shawarma spices and lemon juice all over the chicken. Cover and refrigerate at least 30 min (up to 2 hours).', 'Grill or pan-cook over medium-high heat 6–7 min per side until 75°C internal.', 'Slice thinly across the grain.', 'Warm tortilla, spread garlic sauce.', 'Fill with chicken, lettuce, tomato and wrap tightly.'] },
  { id: '76', icon: '🫐', name: 'Beetroot Goat Cheese Salad', diet: 'Vegetarian', meal: 'Lunch', kcal: 320, carbs: 28, protein: 10, fat: 18, time: '40 min', goal: 'balanced', ingredients: [{ qty: '200g', name: 'Beetroot' }, { qty: '80g', name: 'Goat cheese' }, { qty: '60g', name: 'Walnuts' }, { qty: '80g', name: 'Arugula' }, { qty: '2 tbsp (30ml)', name: 'Balsamic vinegar' }, { qty: '2 tbsp (30ml)', name: 'Olive oil' }, { qty: '1 tsp', name: 'Honey' }], steps: ['Roast beetroot at 200°C for 35 min.', 'Cool and slice.', 'Arrange arugula on plate.', 'Add beetroot, crumbled goat cheese, and walnuts.', 'Drizzle with balsamic, olive oil, and honey.'] },
  { id: '77', icon: '🍱', name: 'Teriyaki Chicken Bento', diet: 'High Protein', meal: 'Lunch', kcal: 490, carbs: 58, protein: 42, fat: 10, time: '25 min', goal: 'muscle_gain', ingredients: [{ qty: '180g', name: 'Chicken thigh' }, { qty: '100g (dry)', name: 'Japanese rice' }, { qty: '80g', name: 'Edamame' }, { qty: '80g', name: 'Broccoli' }, { qty: '3 tbsp (45ml)', name: 'Teriyaki sauce' }, { qty: '1 tsp', name: 'Sesame seeds' }], steps: ['Rinse rice until water runs clear, then cook per package (about 18 min covered for white, 35 min for brown). Start this first — it takes the longest.', 'Glaze chicken with teriyaki sauce and grill over medium-high heat 6–7 min per side until 75°C internal.', 'Steam broccoli and heat edamame.', 'Arrange in bento box and sprinkle sesame seeds.'] },
  { id: '78', icon: '🫕', name: 'Gazpacho', diet: 'Vegan', meal: 'Lunch', kcal: 140, carbs: 18, protein: 4, fat: 6, time: '10 min', goal: 'weight_loss', ingredients: [{ qty: '400g', name: 'Ripe tomatoes' }, { qty: '80g', name: 'Cucumber' }, { qty: '80g', name: 'Red bell pepper' }, { qty: '40g', name: 'Red onion' }, { qty: '1 clove', name: 'Garlic' }, { qty: '2 tbsp (30ml)', name: 'Olive oil' }, { qty: '1 tbsp (15ml)', name: 'Sherry vinegar' }], steps: ['Blend all vegetables until smooth.', 'Add olive oil and sherry vinegar; season.', 'Refrigerate at least 1 hour.', 'Serve chilled with a drizzle of olive oil.'] },

  // ── Dinner extras ───────────────────────────────────────────────────────────
  { id: '79', icon: '🥩', name: 'Lamb Chops & Mint', diet: 'Mediterranean', meal: 'Dinner', kcal: 520, carbs: 6, protein: 52, fat: 32, time: '25 min', goal: 'muscle_gain', ingredients: [{ qty: '250g (2 chops)', name: 'Lamb chops' }, { qty: '2 cloves', name: 'Garlic' }, { qty: '1 sprig', name: 'Rosemary' }, { qty: '1 tbsp (15ml)', name: 'Olive oil' }, { qty: '10g', name: 'Fresh mint' }, { qty: '1 tbsp (15ml)', name: 'Lemon juice' }, { qty: '150g', name: 'Roasted carrots' }], steps: ['Score lamb chops 2–3 times through the fat edge with a sharp knife (prevents the chop from curling in the pan). No need to cut the meat itself — chops cook whole.', 'Rub all surfaces with crushed garlic, rosemary, and olive oil. Cover and refrigerate at least 30 min (up to 4 hours for deeper flavour). Take out of fridge 10 min before cooking.', 'Sear in hot pan over high heat 4 min each side.', 'Rest 5 min before serving.', 'Make mint sauce with mint, lemon, olive oil.', 'Serve with roasted carrots.'] },
  { id: '80', icon: '🍄', name: 'Mushroom Risotto', diet: 'Vegetarian', meal: 'Dinner', kcal: 440, carbs: 66, protein: 12, fat: 14, time: '35 min', goal: 'balanced', ingredients: [{ qty: '150g (dry)', name: 'Arborio rice' }, { qty: '200g', name: 'Mixed mushrooms' }, { qty: '60g', name: 'Onion' }, { qty: '2 cloves', name: 'Garlic' }, { qty: '100ml', name: 'White wine' }, { qty: '600ml', name: 'Warm vegetable stock' }, { qty: '30g', name: 'Parmesan' }, { qty: '1 tbsp (15g)', name: 'Butter' }], steps: ['Sauté onion and garlic over medium heat 3 min until softened.', 'Add rice and toast 2 min.', 'Add wine and stir until absorbed.', 'Add warm stock ladle by ladle, stirring constantly.', 'Fold in mushrooms, parmesan, and butter.'] },
  { id: '81', icon: '🍝', name: 'Pesto Pasta', diet: 'Vegetarian', meal: 'Dinner', kcal: 480, carbs: 62, protein: 16, fat: 20, time: '20 min', goal: 'balanced', ingredients: [{ qty: '100g (dry)', name: 'Penne' }, { qty: '4 tbsp (80g)', name: 'Basil pesto' }, { qty: '100g', name: 'Cherry tomatoes' }, { qty: '30g', name: 'Pine nuts (toasted)' }, { qty: '30g', name: 'Parmesan shavings' }, { qty: '10g', name: 'Fresh basil' }], steps: ['Cook pasta al dente; reserve ¼ cup pasta water.', 'Toss pasta with pesto and a splash of pasta water.', 'Add cherry tomatoes and pine nuts.', 'Top with parmesan and fresh basil.'] },
  { id: '82', icon: '🐟', name: 'Teriyaki Salmon', diet: 'High Protein', meal: 'Dinner', kcal: 450, carbs: 26, protein: 42, fat: 18, time: '20 min', goal: 'muscle_gain', ingredients: [{ qty: '180g', name: 'Salmon fillet' }, { qty: '3 tbsp (45ml)', name: 'Teriyaki sauce' }, { qty: '100g (dry)', name: 'Brown rice' }, { qty: '80g', name: 'Bok choy' }, { qty: '1 tsp', name: 'Sesame seeds' }, { qty: '10g', name: 'Green onion' }], steps: ['Score the skin side of the salmon 2–3 times with a sharp knife (stops the skin from shrinking and curling). No other cutting needed.', 'Spoon teriyaki sauce over the fillet and marinate 10 min at room temperature, or 30 min covered in the fridge — salmon marinates fast, don\'t go longer or the sauce will overpower it.', 'Rinse rice until water runs clear, then cook per package (about 18 min covered for white, 35 min for brown). Start this first — it takes the longest.', 'Pan-sear salmon skin-side up over medium-high heat 4 min each side, basting with sauce.', 'Steam bok choy 3 min.', 'Serve over rice, top with sesame seeds and green onion.'] },
  { id: '83', icon: '🍆', name: 'Eggplant Parmesan', diet: 'Vegetarian', meal: 'Dinner', kcal: 380, carbs: 34, protein: 18, fat: 18, time: '45 min', goal: 'balanced', ingredients: [{ qty: '1 large (400g)', name: 'Eggplant' }, { qty: '150ml', name: 'Marinara sauce' }, { qty: '80g', name: 'Mozzarella' }, { qty: '30g', name: 'Parmesan' }, { qty: '50g', name: 'Breadcrumbs' }, { qty: '1 piece', name: 'Egg' }, { qty: '1 tbsp (15ml)', name: 'Olive oil' }], steps: ['Slice eggplant and salt for 15 min; pat dry.', 'Dip in egg, then breadcrumbs; pan-fry over medium heat until golden.', 'Layer in baking dish with marinara and cheese.', 'Bake at 190°C for 20 min.'] },
  { id: '84', icon: '🥘', name: 'Korean Bibimbap', diet: 'High Protein', meal: 'Dinner', kcal: 510, carbs: 62, protein: 32, fat: 14, time: '30 min', goal: 'muscle_gain', ingredients: [{ qty: '100g (dry)', name: 'Short grain rice' }, { qty: '150g', name: 'Beef mince' }, { qty: '60g', name: 'Spinach' }, { qty: '80g', name: 'Bean sprouts' }, { qty: '80g', name: 'Carrots (julienned)' }, { qty: '1 piece', name: 'Egg (fried)' }, { qty: '2 tbsp (30ml)', name: 'Gochujang sauce' }, { qty: '2 tbsp (30ml)', name: 'Soy sauce' }, { qty: '1 tsp (5ml)', name: 'Sesame oil' }], steps: ['Rinse rice until water runs clear, then cook per package (about 18 min covered for white, 35 min for brown). Start this first — it takes the longest.', 'Sauté each vegetable separately over medium heat with sesame oil 2–3 min.', 'Brown beef over medium heat with soy sauce 5 min until no pink remains.', 'Build bowl: rice, arrange toppings in sections.', 'Add fried egg on top and drizzle gochujang.'] },
  { id: '85', icon: '🥦', name: 'Cauliflower Steak', diet: 'Vegan', meal: 'Dinner', kcal: 240, carbs: 22, protein: 8, fat: 14, time: '25 min', goal: 'weight_loss', ingredients: [{ qty: '1 large head (500g)', name: 'Cauliflower' }, { qty: '2 tbsp (30ml)', name: 'Olive oil' }, { qty: '1 tsp', name: 'Smoked paprika' }, { qty: '1 tsp', name: 'Cumin' }, { qty: '2 cloves', name: 'Garlic' }, { qty: '3 tbsp (45g)', name: 'Tahini sauce' }, { qty: '½ piece', name: 'Lemon' }], steps: ['Cut cauliflower into 2cm steaks.', 'Rub with olive oil, paprika, cumin, garlic.', 'Sear in pan over high heat 3 min each side.', 'Finish in oven at 200°C for 15 min.', 'Drizzle with tahini and lemon.'] },
  { id: '86', icon: '🍝', name: 'Zucchini Bolognese', diet: 'Low Carb', meal: 'Dinner', kcal: 340, carbs: 12, protein: 36, fat: 16, time: '25 min', goal: 'weight_loss', ingredients: [{ qty: '2 medium (400g)', name: 'Zucchini (spiralized)' }, { qty: '200g', name: 'Beef mince' }, { qty: '200g', name: 'Tomato passata' }, { qty: '60g', name: 'Onion' }, { qty: '2 cloves', name: 'Garlic' }, { qty: '1 tsp', name: 'Dried oregano' }, { qty: '20g', name: 'Parmesan' }], steps: ['Brown beef over medium heat with onion and garlic 5–6 min until no pink remains.', 'Add passata and oregano; simmer over low heat 15 min.', 'Sauté zucchini noodles over medium heat 2 min.', 'Top with bolognese and parmesan.'] },
  { id: '87', icon: '🫔', name: 'Lamb Kofta Bowl', diet: 'Mediterranean', meal: 'Dinner', kcal: 500, carbs: 38, protein: 44, fat: 18, time: '30 min', goal: 'muscle_gain', ingredients: [{ qty: '200g', name: 'Ground lamb' }, { qty: '1 tsp', name: 'Cumin' }, { qty: '1 tsp', name: 'Coriander' }, { qty: '¼ tsp', name: 'Salt' }, { qty: '¼ tsp', name: 'Pepper' }, { qty: '80g (dry)', name: 'Couscous' }, { qty: '3 tbsp (60g)', name: 'Tzatziki' }, { qty: '80g', name: 'Cherry tomatoes' }, { qty: '10g', name: 'Fresh mint' }], steps: ['Mix lamb with spices, salt, pepper.', 'Shape into oval koftas.', 'Grill over medium-high heat 4 min each side.', 'Cook couscous with boiling water.', 'Serve over couscous with tzatziki, tomatoes, and mint.'] },
  { id: '88', icon: '🧆', name: 'Falafel Buddha Bowl', diet: 'Vegan', meal: 'Dinner', kcal: 430, carbs: 58, protein: 16, fat: 16, time: '25 min', goal: 'balanced', ingredients: [{ qty: '6 pieces (180g)', name: 'Falafel' }, { qty: '80g (dry)', name: 'Quinoa' }, { qty: '80g', name: 'Cucumber' }, { qty: '80g', name: 'Cherry tomatoes' }, { qty: '40g', name: 'Red cabbage (shredded)' }, { qty: '3 tbsp (45ml)', name: 'Tahini dressing' }, { qty: '5g', name: 'Fresh parsley' }], steps: ['Rinse quinoa under cold water (this removes the bitter coating), then simmer in 2× water covered 15 min until grains show little white tails.', 'Bake falafel at 180°C for 10 min until heated through.', 'Build bowl with quinoa base.', 'Add falafel and vegetables.', 'Drizzle tahini dressing and top with parsley.'] },
  { id: '89', icon: '🥗', name: 'Panzanella', diet: 'Vegan', meal: 'Dinner', kcal: 340, carbs: 46, protein: 8, fat: 14, time: '15 min', goal: 'balanced', ingredients: [{ qty: '150g', name: 'Sourdough (cubed, day-old)' }, { qty: '300g', name: 'Ripe tomatoes' }, { qty: '80g', name: 'Cucumber' }, { qty: '40g', name: 'Red onion' }, { qty: '10g', name: 'Fresh basil' }, { qty: '3 tbsp (45ml)', name: 'Olive oil' }, { qty: '2 tbsp (30ml)', name: 'Red wine vinegar' }], steps: ['Toast bread cubes in olive oil over medium heat until golden.', 'Chop tomatoes, cucumber, and onion.', 'Toss with bread and basil.', 'Dress with olive oil and red wine vinegar.', 'Rest 10 min so bread absorbs juices.'] },
  { id: '90', icon: '🍕', name: 'Cauliflower Crust Pizza', diet: 'Keto', meal: 'Dinner', kcal: 360, carbs: 14, protein: 26, fat: 22, time: '40 min', goal: 'weight_loss', ingredients: [{ qty: '300g', name: 'Cauliflower (riced)' }, { qty: '1 piece', name: 'Egg' }, { qty: '60g', name: 'Mozzarella (base)' }, { qty: '4 tbsp (60ml)', name: 'Tomato sauce' }, { qty: '60g', name: 'Mozzarella (topping)' }, { qty: '80g', name: 'Pepperoni or veggies' }, { qty: '5g', name: 'Fresh basil' }], steps: ['Microwave riced cauliflower 5 min; squeeze out all moisture.', 'Mix with egg and mozzarella for base.', 'Spread thin on baking sheet and bake 200°C for 20 min.', 'Add toppings and bake 10 min more.', 'Top with fresh basil.'] },

  // ── Snack extras ────────────────────────────────────────────────────────────
  { id: '91', icon: '🍫', name: 'Dark Chocolate Bark', diet: 'Vegan', meal: 'Snack', kcal: 200, carbs: 18, protein: 4, fat: 14, time: '10 min', goal: 'balanced', ingredients: [{ qty: '80g', name: 'Dark chocolate (70%+)' }, { qty: '20g', name: 'Mixed nuts' }, { qty: '20g', name: 'Dried cranberries' }, { qty: '10g', name: 'Sunflower seeds' }, { qty: '¼ tsp', name: 'Sea salt flakes' }], steps: ['Melt chocolate over double boiler.', 'Pour onto parchment-lined tray.', 'Scatter nuts, cranberries, seeds, and salt.', 'Refrigerate 30 min until set.', 'Break into pieces.'] },
  { id: '92', icon: '🧀', name: 'Cheese & Nut Board', diet: 'Keto', meal: 'Snack', kcal: 220, carbs: 4, protein: 12, fat: 18, time: '5 min', goal: 'weight_loss', ingredients: [{ qty: '40g', name: 'Aged cheddar' }, { qty: '30g', name: 'Gouda' }, { qty: '30g', name: 'Mixed nuts' }, { qty: '60g', name: 'Cucumber slices' }, { qty: '30g', name: 'Celery sticks' }], steps: ['Slice cheeses.', 'Arrange on a small board with nuts and vegetables.', 'Serve immediately.'] },
  { id: '93', icon: '🥝', name: 'Kiwi Coconut Yogurt', diet: 'Vegan', meal: 'Snack', kcal: 170, carbs: 28, protein: 4, fat: 6, time: '3 min', goal: 'balanced', ingredients: [{ qty: '150g', name: 'Coconut yogurt' }, { qty: '2 medium (80g)', name: 'Kiwifruit' }, { qty: '1 tsp (7ml)', name: 'Honey' }, { qty: '10g', name: 'Granola' }], steps: ['Peel and slice kiwifruit.', 'Top yogurt with kiwi, granola, and honey.'] },
  { id: '94', icon: '🥜', name: 'PB Celery Sticks', diet: 'Keto', meal: 'Snack', kcal: 160, carbs: 8, protein: 6, fat: 12, time: '3 min', goal: 'weight_loss', ingredients: [{ qty: '3 large stalks (150g)', name: 'Celery' }, { qty: '2 tbsp (32g)', name: 'Peanut butter' }, { qty: '1 tsp', name: 'Chia seeds' }], steps: ['Cut celery into 10cm sticks.', 'Fill channel with peanut butter.', 'Sprinkle chia seeds on top.'] },
  { id: '95', icon: '🐟', name: 'Smoked Salmon Bites', diet: 'Keto', meal: 'Snack', kcal: 180, carbs: 3, protein: 18, fat: 10, time: '5 min', goal: 'weight_loss', ingredients: [{ qty: '80g', name: 'Smoked salmon' }, { qty: '80g', name: 'Cucumber slices' }, { qty: '2 tbsp (30g)', name: 'Cream cheese' }, { qty: '5g', name: 'Fresh dill' }, { qty: '½ piece', name: 'Lemon' }], steps: ['Top cucumber slices with cream cheese.', 'Add a piece of smoked salmon.', 'Garnish with dill and a squeeze of lemon.'] },
  { id: '96', icon: '🍇', name: 'Frozen Grapes & Brie', diet: 'Vegetarian', meal: 'Snack', kcal: 200, carbs: 24, protein: 6, fat: 10, time: '2 min', goal: 'balanced', ingredients: [{ qty: '150g', name: 'Seedless grapes (pre-frozen)' }, { qty: '40g', name: 'Brie cheese' }, { qty: '5g', name: 'Fresh thyme' }], steps: ['Freeze grapes at least 2 hours ahead.', 'Serve frozen grapes alongside sliced brie.', 'Garnish with fresh thyme.'] },
  { id: '97', icon: '🫘', name: 'Crispy Roasted Chickpeas', diet: 'Vegan', meal: 'Snack', kcal: 190, carbs: 26, protein: 10, fat: 6, time: '30 min', goal: 'balanced', ingredients: [{ qty: '200g (cooked)', name: 'Chickpeas (drained, dried)' }, { qty: '1 tbsp (15ml)', name: 'Olive oil' }, { qty: '1 tsp', name: 'Smoked paprika' }, { qty: '½ tsp', name: 'Garlic powder' }, { qty: '¼ tsp', name: 'Cayenne pepper' }, { qty: '¼ tsp', name: 'Salt' }], steps: ['Pat chickpeas completely dry.', 'Toss with olive oil and spices.', 'Spread on baking tray.', 'Bake at 200°C for 25–30 min, shaking halfway.', 'Cool before eating — they crisp as they cool.'] },
  { id: '98', icon: '🍦', name: 'Banana Nice Cream', diet: 'Vegan', meal: 'Snack', kcal: 150, carbs: 36, protein: 2, fat: 1, time: '5 min', goal: 'weight_loss', ingredients: [{ qty: '2 medium (240g)', name: 'Frozen bananas' }, { qty: '1 tbsp (15ml)', name: 'Almond milk' }, { qty: '1 tsp', name: 'Vanilla extract' }], steps: ['Break frozen bananas into chunks.', 'Blend with almond milk until creamy.', 'Serve immediately for soft-serve texture, or freeze 30 min for a firmer scoop.'] },
  { id: '99', icon: '🧁', name: 'Protein Mug Cake', diet: 'High Protein', meal: 'Snack', kcal: 240, carbs: 20, protein: 24, fat: 6, time: '5 min', goal: 'muscle_gain', ingredients: [{ qty: '1 scoop (30g)', name: 'Chocolate protein powder' }, { qty: '2 tbsp (16g)', name: 'Oat flour' }, { qty: '1 piece', name: 'Egg' }, { qty: '2 tbsp (30ml)', name: 'Almond milk' }, { qty: '1 tsp (5g)', name: 'Cocoa powder' }, { qty: '¼ tsp', name: 'Baking powder' }], steps: ['Mix all ingredients in a mug.', 'Microwave on high for 60–90 seconds.', 'Check center is set (not liquid).', 'Cool 1 min before eating.'] },
  { id: '100', icon: '🥑', name: 'Avocado Crispbreads', diet: 'Vegan', meal: 'Snack', kcal: 210, carbs: 20, protein: 4, fat: 14, time: '5 min', goal: 'balanced', ingredients: [{ qty: '3 pieces', name: 'Rye crispbreads' }, { qty: '1 small (100g)', name: 'Avocado' }, { qty: '½ piece', name: 'Lemon' }, { qty: '¼ tsp', name: 'Red pepper flakes' }, { qty: '¼ tsp', name: 'Salt' }, { qty: '5g', name: 'Microgreens' }], steps: ['Mash avocado with lemon juice and salt.', 'Spread generously on crispbreads.', 'Top with microgreens and red pepper flakes.'] },
];

const FOOD_CATEGORIES = ['Vegetables', 'Fruits', 'Meat', 'Seafood', 'Dairy', 'Eggs', 'Grains', 'Legumes', 'Nuts', 'Oils', 'Condiments', 'Drinks', 'Snacks', 'Prepared'];

type CategoryMeta = { icon: string; color: string };
const CATEGORY_META: Record<string, CategoryMeta> = {
  Vegetables: { icon: '🥦', color: colors.green },
  Fruits:     { icon: '🍎', color: colors.honey },
  Meat:       { icon: '🥩', color: colors.rose },
  Seafood:    { icon: '🐟', color: colors.sky },
  Dairy:      { icon: '🥛', color: colors.lavender },
  Eggs:       { icon: '🥚', color: colors.honey },
  Grains:     { icon: '🌾', color: colors.honey },
  Legumes:    { icon: '🫘', color: colors.teal },
  Nuts:       { icon: '🌰', color: colors.honey },
  Oils:       { icon: '🫒', color: colors.green },
  Condiments: { icon: '🫙', color: colors.purple3 },
  Drinks:     { icon: '🥤', color: colors.sky },
  Snacks:     { icon: '🍿', color: colors.rose },
  Prepared:   { icon: '🍽️', color: colors.violet },
};

function getFoodCategory(food: LocalFood): string {
  if (food.id.startsWith('sn')) return 'Snacks';
  if (food.id.startsWith('v'))  return 'Vegetables';
  if (food.id.startsWith('f'))  return 'Fruits';
  if (food.id.startsWith('m'))  return 'Meat';
  if (food.id.startsWith('s'))  return 'Seafood';
  if (food.id.startsWith('d'))  return 'Dairy';
  if (food.id.startsWith('e'))  return 'Eggs';
  if (food.id.startsWith('g'))  return 'Grains';
  if (food.id.startsWith('l'))  return 'Legumes';
  if (food.id.startsWith('n'))  return 'Nuts';
  if (food.id.startsWith('o'))  return 'Oils';
  if (food.id.startsWith('c'))  return 'Condiments';
  if (food.id.startsWith('b'))  return 'Drinks';
  if (food.id.startsWith('p'))  return 'Prepared';
  return 'Other';
}

// Scale every numeric token (and common unicode fractions) inside a quantity
// string by `n`. Used by the recipe-detail "Serving: N" stepper so when the
// user bumps servings, both the macro pills and ingredient amounts scale up.
// Examples: '200g'×3 → '600g'  ·  '1 tbsp (15ml)'×2 → '2 tbsp (30ml)'  ·
// '½ piece'×4 → '2 piece'  ·  '¼ tsp'×4 → '1 tsp'.
const FRACTION_MAP: Record<string, number> = {
  '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125,
};
function multiplyQty(qty: string, n: number): string {
  if (n === 1 || !qty) return qty;
  return qty.replace(/(\d+(?:\.\d+)?|[½¼¾⅓⅔⅛])/g, (m) => {
    const v = FRACTION_MAP[m] ?? parseFloat(m);
    if (Number.isNaN(v)) return m;
    const product = v * n;
    return product % 1 === 0
      ? String(product)
      : (Math.round(product * 10) / 10).toString();
  });
}

function RecipeCard({ recipe, onPress, selectMode, selected }: {
  recipe: typeof RECIPES[0];
  onPress: () => void;
  selectMode?: boolean;
  selected?: boolean;
}) {
  const photo = RECIPE_PHOTOS[recipe.id];

  // Photo-hero variant — Mob Kitchen style. Image fills the card; the bottom
  // fades into the page bg via a LinearGradient, and the recipe name sits on
  // the dark area where the photo "ends".
  if (photo) {
    return (
      <TouchableOpacity
        style={[styles.recipeCardPhoto, selectMode && selected && styles.recipeCardSelected]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <Image source={photo} style={styles.recipeCardPhotoImg} resizeMode="cover" />
        {/* Bottom fade — transparent → colors.bg so the photo melts into the page */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(12,8,24,0)', 'rgba(12,8,24,0.65)', colors.bg]}
          locations={[0, 0.55, 1]}
          start={{ x: 0.5, y: 0.35 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        {selectMode && (
          <View style={[styles.selectBadge, selected && styles.selectBadgeOn]}>
            {selected && <Ionicons name="checkmark" size={14} color={colors.white} />}
          </View>
        )}
        {/* Top-left diet pill, overlaid on the photo */}
        <View style={styles.recipePhotoDietBadge}>
          <Text style={styles.recipePhotoDietTxt}>{recipe.diet}</Text>
        </View>
        {/* Bottom — name + meta sit on the dark gradient area */}
        <View style={styles.recipePhotoFooter}>
          <Text style={styles.recipePhotoName} numberOfLines={2}>{recipe.name}</Text>
          <View style={styles.recipePhotoMetaRow}>
            <Text style={styles.recipePhotoMeta}>⏱ {recipe.time}</Text>
            <Text style={styles.recipePhotoKcal}>{recipe.kcal} kcal</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // Fallback — emoji-icon card for recipes without a hero photo.
  return (
    <TouchableOpacity
      style={[styles.recipeCard, selectMode && selected && styles.recipeCardSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {selectMode && (
        <View style={[styles.selectBadge, selected && styles.selectBadgeOn]}>
          {selected && <Ionicons name="checkmark" size={14} color={colors.white} />}
        </View>
      )}
      <Text style={styles.recipeIcon}>{recipe.icon}</Text>
      <View style={styles.dietBadge}>
        <Text style={styles.dietBadgeText}>{recipe.diet}</Text>
      </View>
      <Text style={styles.recipeName}>{recipe.name}</Text>
      <View style={styles.recipeMetaRow}>
        <Text style={styles.recipeMeta}>⏱ {recipe.time}</Text>
        <Text style={styles.recipeKcal}>{recipe.kcal} kcal</Text>
      </View>
      <View style={styles.recipeMacroRow}>
        <Text style={[styles.recipeMacroTxt, styles.recipeMacroP]}>P {recipe.protein}g</Text>
        <Text style={[styles.recipeMacroTxt, styles.recipeMacroC]}>C {recipe.carbs}g</Text>
        <Text style={[styles.recipeMacroTxt, styles.recipeMacroF]}>F {recipe.fat}g</Text>
      </View>
    </TouchableOpacity>
  );
}

function FoodCard({ food, onPress }: { food: LocalFood; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.foodCard} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.foodIcon}>{food.icon}</Text>
      <View style={styles.foodCatBadge}>
        <Text style={styles.foodCatText}>{getFoodCategory(food)}</Text>
      </View>
      <Text style={styles.foodName}>{food.name}</Text>
      <Text style={styles.foodKcal}>{food.kcal} kcal</Text>
      <View style={styles.recipeMacroRow}>
        <Text style={[styles.recipeMacroTxt, styles.recipeMacroP]}>P {food.protein}g</Text>
        <Text style={[styles.recipeMacroTxt, styles.recipeMacroC]}>C {food.carbs}g</Text>
        <Text style={[styles.recipeMacroTxt, styles.recipeMacroF]}>F {food.fat}g</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function RecipesScreen() {
  const { entries, addFood, loadEntry } = useDiaryStore();
  const { addXp, calorieGoal, hasUnread, checkAndUpdateStreak, dietaryPreferences } = useAppStore();
  const { email, profile } = useAuthStore();
  const [recipeSearch, setRecipeSearch] = useState('');
  const [foodSearch, setFoodSearch] = useState('');
  const [filter, setFilter] = useState(
    (dietaryPreferences && DIET_FILTERS.includes(dietaryPreferences)) ? dietaryPreferences : 'All'
  );
  const [selected, setSelected] = useState<typeof RECIPES[0] | null>(null);
  const [mealPickerOpen, setMealPickerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'recipes' | 'foods'>('recipes');
  // Serving multiplier for the currently-open recipe. Tap the header pill to
  // cycle 1→2→…→10→1; macros, ingredients, diary log, and grocery add all
  // scale by this number.
  const [servings, setServings] = useState(1);

  // Auto-close the bottom meal-picker sheet whenever the recipe modal closes
  // so it doesn't reappear stale on the next recipe tap. Also reset servings
  // back to 1 so the next recipe opens fresh.
  useEffect(() => {
    if (!selected) {
      setMealPickerOpen(false);
      setServings(1);
    }
  }, [selected]);
  const [foodFilter, setFoodFilter] = useState('All');
  const [selectedFood, setSelectedFood] = useState<LocalFood | null>(null);
  const [foodMeal, setFoodMeal] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('snack');

  // Multi-recipe Plan-Shopping mode: tap recipe cards to toggle selection,
  // then "Create Grocery List" merges all picked recipes' ingredients into
  // the grocery list (deduped + qty merged across recipes).
  const [planMode, setPlanMode] = useState(false);
  const [planSelected, setPlanSelected] = useState<Set<string>>(new Set());

  // Recipes always log to today — never to a past date the user was browsing in diary
  const today = new Date().toLocaleDateString('en-CA');

  // Toggle a recipe's pick state in plan mode
  const togglePlanRecipe = (id: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlanSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Merge all picked recipes' ingredients into the grocery list and exit plan mode
  const submitPlan = async () => {
    if (planSelected.size === 0) return;
    const picked = RECIPES.filter(r => planSelected.has(r.id)).map(r => ({
      id: r.id, name: r.name, ingredients: r.ingredients,
    }));
    const result = await addRecipesToGrocery(email, picked);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      'Grocery list updated ✓',
      `${result.added} added · ${result.merged} merged into existing items\nfrom ${picked.length} recipe${picked.length > 1 ? 's' : ''}`,
    );
    setPlanSelected(new Set());
    setPlanMode(false);
  };

  // Add a single recipe's ingredients to the grocery list (used from detail modal)
  const addOneToGrocery = async (recipe: typeof RECIPES[0], multiplier = 1) => {
    const scaled = recipe.ingredients.map((ing) => ({
      qty: multiplyQty(ing.qty, multiplier),
      name: ing.name,
    }));
    const result = await addRecipesToGrocery(email, [{ id: recipe.id, name: recipe.name, ingredients: scaled }]);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      'Added to grocery list ✓',
      `${result.added} added · ${result.merged} merged into existing items`,
    );
  };

  // Ensure today's entry is loaded into the store
  useEffect(() => { loadEntry(today); }, [loadEntry, today]);

  const entry = entries[today];
  const totalKcal = (entry?.foods ?? []).reduce((s, f) => s + f.kcal, 0);
  const remaining = Math.max(0, calorieGoal - totalKcal);

  const filtered = RECIPES.filter((r) => {
    const matchSearch = r.name.toLowerCase().includes(recipeSearch.toLowerCase());
    if (!matchSearch) return false;
    if (filter === 'All') return true;
    if (filter === 'For your goal') return remaining > 0 && r.kcal <= remaining;
    if (['Breakfast', 'Lunch', 'Dinner', 'Snack'].includes(filter)) return r.meal === filter;
    if (filter === 'Quick') return parseInt(r.time, 10) <= 15;
    return r.diet === filter;
  });

  const filteredFoods = FOOD_DATABASE.filter(f => {
    if (foodSearch) return f.name.toLowerCase().includes(foodSearch.toLowerCase()); // global search ignores category
    if (foodFilter === 'All') return true;
    return getFoodCategory(f) === foodFilter;
  });

  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerBlurOpacity = scrollY.interpolate({ inputRange: [20, 120], outputRange: [0, 1], extrapolate: 'clamp' });
  const headerH = 50 + insets.top + 16;
  const scrollPaddingTop = 60 + insets.top;

  return (
    <View style={styles.safe}>
      <View style={[styles.fixedHeader, { paddingTop: insets.top, height: headerH }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: headerBlurOpacity }]}>
          <BlurView tint="dark" intensity={Platform.OS === 'ios' ? 80 : 100} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['transparent', colors.bg]} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 18 }} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} pointerEvents="none" />
        </Animated.View>
        <View style={styles.appHeader}>
          <TouchableOpacity onPress={() => router.push('/(tabs)/profile')} style={styles.avatarBtn}>
            <View style={styles.avatarThumb}>
              <Text style={styles.avatarInitial}>{(() => { const p = (profile?.name ?? '').trim().split(/\s+/).filter(Boolean); return p.length >= 2 ? (p[0][0] + p[p.length-1][0]).toUpperCase() : (p[0]?.[0] ?? email?.[0] ?? '?').toUpperCase(); })()}</Text>
            </View>
            {hasUnread && <View style={styles.avatarDot} />}
          </TouchableOpacity>
          <View style={styles.headingWrap} pointerEvents="none"><Text style={styles.heading}>Recipes</Text></View>
          <View style={styles.headerRight}>
            {viewMode === 'recipes' && (
              <TouchableOpacity
                style={[styles.iconBtn, planMode && styles.iconBtnActive]}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (planMode) setPlanSelected(new Set());
                  setPlanMode(m => !m);
                }}
              >
                <Ionicons name="cart-outline" size={22} color={planMode ? colors.lavender : colors.ink2} />
                {planMode && planSelected.size > 0 && (
                  <View style={styles.planCountBadge}>
                    <Text style={styles.planCountTxt}>{planSelected.size}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.scroll, { paddingTop: scrollPaddingTop }]}
        showsVerticalScrollIndicator={false}>

        {/* Plan Shopping banner */}
        {planMode && (
          <View style={styles.planBanner}>
            <Ionicons name="cart" size={16} color={colors.lavender} />
            <Text style={styles.planBannerTxt}>
              Tap recipes to build a grocery list
            </Text>
          </View>
        )}

        {/* Calorie budget banner */}
        {remaining > 0 && (
          <View style={styles.budgetBanner}>
            <View style={styles.budgetLeft}>
              <Text style={styles.budgetLabel}>CALORIE BUDGET</Text>
              <Text style={styles.budgetVal}><Text style={styles.budgetNum}>{fmt(remaining)}</Text> kcal remaining</Text>
            </View>
            <View style={styles.budgetRing}>
              <Text style={styles.budgetPct}>{Math.round((totalKcal / calorieGoal) * 100)}%</Text>
              <Text style={styles.budgetPctLbl}>used</Text>
            </View>
          </View>
        )}

        {/* Tab switcher */}
        <View style={styles.tabSwitcher}>
          <TouchableOpacity
            style={[styles.tabBtn, viewMode === 'recipes' && styles.tabBtnActive]}
            onPress={() => { setViewMode('recipes'); setRecipeSearch(''); setFilter('All'); }}
          >
            <Text style={[styles.tabBtnTxt, viewMode === 'recipes' && styles.tabBtnTxtActive]}>Recipes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, viewMode === 'foods' && styles.tabBtnActive]}
            onPress={() => { setViewMode('foods'); setFoodSearch(''); setFoodFilter('All'); }}
          >
            <Text style={[styles.tabBtnTxt, viewMode === 'foods' && styles.tabBtnTxtActive]}>Ingredients</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={16} color={colors.ink3} style={styles.searchIcon} />
          <TextInput
            style={styles.search}
            placeholder={viewMode === 'recipes' ? 'Search recipes...' : 'Search ingredients...'}
            placeholderTextColor={colors.ink3}
            value={viewMode === 'recipes' ? recipeSearch : foodSearch}
            onChangeText={viewMode === 'recipes' ? setRecipeSearch : setFoodSearch}
          />
          {(viewMode === 'recipes' ? recipeSearch : foodSearch).length > 0 && (
            <TouchableOpacity onPress={() => viewMode === 'recipes' ? setRecipeSearch('') : setFoodSearch('')}>
              <Ionicons name="close-circle" size={16} color={colors.ink3} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filters — only show diet chips in Recipes mode */}
        {viewMode === 'recipes' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
            {DIET_FILTERS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterChip, filter === f && styles.filterActive]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Foods mode: back row when inside a category */}
        {viewMode === 'foods' && foodFilter !== 'All' && !foodSearch && (
          <TouchableOpacity style={styles.backRow} onPress={() => setFoodFilter('All')}>
            <Ionicons name="chevron-back" size={fontSize.base} color={colors.purple3} />
            <Text style={styles.backRowTxt}>All Categories</Text>
            <View style={[styles.catBackBadge, { backgroundColor: (CATEGORY_META[foodFilter]?.color ?? colors.purple) + '22', borderColor: (CATEGORY_META[foodFilter]?.color ?? colors.purple) + '55' }]}>
              <Text style={[styles.catBackLabel, { color: CATEGORY_META[foodFilter]?.color ?? colors.purple }]}>
                {CATEGORY_META[foodFilter]?.icon} {foodFilter}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {viewMode === 'recipes' ? (
          <>
            {/* Recipe grid — header reflects active filter */}
            <Text style={styles.sectionHdr}>
              {filter === 'All' && !recipeSearch
                ? 'All Recipes'
                : filter === 'For your goal'
                  ? `Fits your remaining ${fmt(remaining)} kcal · ${filtered.length} recipe${filtered.length !== 1 ? 's' : ''}`
                  : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}
            </Text>
            <View style={styles.grid}>
              {filtered.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  selectMode={planMode}
                  selected={planSelected.has(recipe.id)}
                  onPress={() => planMode ? togglePlanRecipe(recipe.id) : setSelected(recipe)}
                />
              ))}
              {filtered.length === 0 && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>🔍</Text>
                  <Text style={styles.emptyTxt}>No recipes found</Text>
                </View>
              )}
            </View>
          </>
        ) : foodSearch ? (
          /* Search results across all foods */
          <>
            <Text style={styles.sectionHdr}>{filteredFoods.length} result{filteredFoods.length !== 1 ? 's' : ''}</Text>
            <View style={styles.grid}>
              {filteredFoods.map(food => (
                <FoodCard key={food.id} food={food} onPress={() => setSelectedFood(food)} />
              ))}
              {filteredFoods.length === 0 && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>🔍</Text>
                  <Text style={styles.emptyTxt}>No ingredients found</Text>
                </View>
              )}
            </View>
          </>
        ) : foodFilter === 'All' ? (
          /* Browse: category grid */
          <>
            <Text style={styles.sectionHdr}>Browse categories</Text>
            <View style={styles.catGrid}>
              {FOOD_CATEGORIES.map(cat => {
                const meta = CATEGORY_META[cat];
                const count = FOOD_DATABASE.filter(f => getFoodCategory(f) === cat).length;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catCard, { borderColor: meta.color + '55' }]}
                    onPress={() => setFoodFilter(cat)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.catCardIcon, { backgroundColor: meta.color + '22' }]}>
                      <Text style={styles.catCardEmoji}>{meta.icon}</Text>
                    </View>
                    <Text style={styles.catCardName}>{cat}</Text>
                    <Text style={[styles.catCardCount, { color: meta.color }]}>{count} ingredients</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : (
          /* Category drill-down: food grid */
          <>
            <Text style={styles.sectionHdr}>{filteredFoods.length} ingredients · per 100g</Text>
            <View style={styles.grid}>
              {filteredFoods.map(food => (
                <FoodCard key={food.id} food={food} onPress={() => setSelectedFood(food)} />
              ))}
            </View>
          </>
        )}
      </Animated.ScrollView>

      {/* Food detail modal */}
      <Modal visible={!!selectedFood} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setSelectedFood(null); setFoodMeal('snack'); }}>
        {selectedFood && (
          <SafeAreaView style={styles.modal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => { setSelectedFood(null); setFoodMeal('snack'); }} style={styles.closeBtn}>
                <Ionicons name="close" size={fontSize.base} color={colors.ink2} />
              </TouchableOpacity>
              <Text style={styles.modalMeal}>{getFoodCategory(selectedFood)}</Text>
              <TouchableOpacity onPress={async () => {
                await addFood(today, {
                  id: `${Date.now()}`, icon: selectedFood.icon, name: selectedFood.name,
                  kcal: selectedFood.kcal, carbs: selectedFood.carbs,
                  protein: selectedFood.protein, fat: selectedFood.fat,
                  unit: '100g', meal: foodMeal,
                  fiber: selectedFood.fiber, sugar: selectedFood.sugar, sodium: selectedFood.sodium,
                });
                await checkAndUpdateStreak(today);
                await addXp(10);
                Alert.alert('Added to diary ✓', `${selectedFood.name} logged (100g). +10 XP`);
                setSelectedFood(null); setFoodMeal('snack');
              }} activeOpacity={0.85} style={styles.addBtn}>
                <LinearGradient colors={[colors.purple, colors.purpleGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.addBtnGrad}>
                  <Text style={styles.addBtnTxt}>+ Add</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.modalIcon}>{selectedFood.icon}</Text>
              <Text style={styles.modalTitle}>{selectedFood.name}</Text>
              <Text style={styles.modalTime}>Per 100g · USDA values</Text>

              <View style={styles.modalMacros}>
                {[
                  { label: 'Kcal',    value: selectedFood.kcal,              color: colors.lavender },
                  { label: 'Protein', value: `${selectedFood.protein}g`,     color: colors.macroProtein },
                  { label: 'Carbs',   value: `${selectedFood.carbs}g`,       color: colors.macroCarbs },
                  { label: 'Fat',     value: `${selectedFood.fat}g`,         color: colors.macroFat },
                ].map(({ label, value, color }) => (
                  <View key={label} style={styles.modalMacroPill}>
                    <Text style={[styles.modalMacroVal, { color }]}>{value}</Text>
                    <Text style={styles.modalMacroLabel}>{label}</Text>
                  </View>
                ))}
              </View>

              {/* Extra micros */}
              <View style={styles.microRow}>
                {[
                  { label: 'Fiber',   value: `${selectedFood.fiber}g` },
                  { label: 'Sugar',   value: `${selectedFood.sugar}g` },
                  { label: 'Sodium',  value: `${selectedFood.sodium}mg` },
                ].map(({ label, value }) => (
                  <View key={label} style={styles.microPill}>
                    <Text style={styles.microVal}>{value}</Text>
                    <Text style={styles.microLabel}>{label}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.mealPickerRow}>
                {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(m => (
                  <TouchableOpacity key={m} style={[styles.mealChip, foodMeal === m && styles.mealChipSel]} onPress={() => setFoodMeal(m)}>
                    <Text style={[styles.mealChipTxt, foodMeal === m && styles.mealChipTxtSel]}>{m.charAt(0).toUpperCase() + m.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.logBtn} activeOpacity={0.85} onPress={async () => {
                await addFood(today, {
                  id: `${Date.now()}`, icon: selectedFood.icon, name: selectedFood.name,
                  kcal: selectedFood.kcal, carbs: selectedFood.carbs,
                  protein: selectedFood.protein, fat: selectedFood.fat,
                  unit: '100g', meal: foodMeal,
                  fiber: selectedFood.fiber, sugar: selectedFood.sugar, sodium: selectedFood.sodium,
                });
                await checkAndUpdateStreak(today);
                await addXp(10);
                Alert.alert('Food logged ✓', `${selectedFood.name} added to your diary. +10 XP`);
                setSelectedFood(null); setFoodMeal('snack');
              }}>
                <LinearGradient colors={[colors.purple, colors.purpleGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.logBtnGrad}>
                  <Text style={styles.logBtnTxt}>Log 100g to diary</Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      {/* Recipe detail modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && (
          <SafeAreaView style={styles.modal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setSelected(null)} style={styles.closeBtn}>
                <Ionicons name="close-sharp" size={24} color={colors.ink} />
              </TouchableOpacity>
              <View style={styles.headerActions}>
                <View style={styles.servingStepper}>
                  <TouchableOpacity
                    style={styles.servingStepBtn}
                    activeOpacity={0.6}
                    disabled={servings <= 1}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setServings((n) => Math.max(1, n - 1));
                    }}
                  >
                    <Ionicons
                      name="remove"
                      size={16}
                      color={servings <= 1 ? colors.ink3 : colors.lavender}
                    />
                  </TouchableOpacity>
                  <Text style={styles.servingStepTxt}>Serving: {servings}</Text>
                  <TouchableOpacity
                    style={styles.servingStepBtn}
                    activeOpacity={0.6}
                    disabled={servings >= 100}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setServings((n) => Math.min(100, n + 1));
                    }}
                  >
                    <Ionicons
                      name="add"
                      size={16}
                      color={servings >= 100 ? colors.ink3 : colors.lavender}
                    />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.addDiaryHeaderBtn}
                  activeOpacity={0.78}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setMealPickerOpen(true);
                  }}
                >
                  <Ionicons name="add" size={16} color={colors.lavender} />
                  <Ionicons name="journal" size={18} color={colors.lavender} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addGroceryHeaderBtn}
                  activeOpacity={0.78}
                  onPress={async () => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    await addOneToGrocery(selected, servings);
                    setSelected(null);
                  }}
                >
                  <Ionicons name="add" size={16} color={colors.lavender} />
                  <Ionicons name="cart" size={18} color={colors.lavender} />
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              {(() => {
                const photo = RECIPE_PHOTOS[selected.id];
                return photo ? (
                  <View style={styles.modalPhotoWrap}>
                    <Image source={photo} style={styles.modalPhoto} resizeMode="cover" />
                    <LinearGradient
                      pointerEvents="none"
                      colors={['rgba(12,8,24,0)', colors.bg]}
                      start={{ x: 0.5, y: 0.65 }}
                      end={{ x: 0.5, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                  </View>
                ) : (
                  <Text style={styles.modalIcon}>{selected.icon}</Text>
                );
              })()}
              <Text style={styles.modalTitle}>{selected.name}</Text>
              <Text style={styles.modalTime}>⏱ {selected.time}</Text>

              {/* Macro pills — scale with the serving multiplier so users see
                  the actual numbers they're about to log. */}
              <View style={styles.modalMacros}>
                {[
                  { label: 'Kcal',    value: selected.kcal * servings,            color: colors.lavender },
                  { label: 'Carbs',   value: `${selected.carbs * servings}g`,     color: colors.macroCarbs },
                  { label: 'Protein', value: `${selected.protein * servings}g`,   color: colors.macroProtein },
                  { label: 'Fat',     value: `${selected.fat * servings}g`,       color: colors.macroFat },
                ].map(({ label, value, color }) => (
                  <View key={label} style={styles.modalMacroPill}>
                    <Text style={[styles.modalMacroVal, { color }]}>{value}</Text>
                    <Text style={styles.modalMacroLabel}>{label}</Text>
                  </View>
                ))}
              </View>

              {/* Fits budget indicator — compares the scaled total (what will
                  actually be logged) against the remaining budget. */}
              {selected.kcal * servings <= remaining && remaining > 0 && (
                <View style={styles.fitsBadge}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.green} />
                  <Text style={styles.fitsTxt}>Fits your {remaining} kcal remaining budget</Text>
                </View>
              )}

              <View style={styles.ingredientsTable}>
                <View style={styles.ingredientHeaderRow}>
                  <Text style={styles.ingredientHeaderQty}>Amount</Text>
                  <View style={styles.ingredientColSep} />
                  <Text style={styles.ingredientHeaderName}>Ingredient</Text>
                </View>
                {selected.ingredients.map((ing, i) => (
                  <View
                    key={i}
                    style={[
                      styles.ingredientRow,
                      i < selected.ingredients.length - 1 && styles.ingredientRowDivided,
                    ]}
                  >
                    <Text style={styles.ingredientQty}>{multiplyQty(ing.qty, servings)}</Text>
                    <View style={styles.ingredientColSep} />
                    <Text style={styles.ingredientTxt}>{ing.name}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.modalSection}>Instructions</Text>
              <View style={styles.stepsCard}>
                {selected.steps.map((step, i) => (
                  <View
                    key={i}
                    style={[
                      styles.stepRow,
                      i < selected.steps.length - 1 && styles.stepRowDivided,
                    ]}
                  >
                    <View style={styles.stepNum}>
                      <Text style={styles.stepNumTxt}>{i + 1}</Text>
                    </View>
                    <Text style={styles.stepTxt}>{step}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>

            {/* Bottom-sheet meal picker — opened by the "+ diary" header button. */}
            {mealPickerOpen && (
              <View style={styles.mealPickerOverlay}>
                <TouchableOpacity
                  style={StyleSheet.absoluteFillObject}
                  activeOpacity={1}
                  onPress={() => setMealPickerOpen(false)}
                />
                <View style={styles.mealPickerSheet}>
                  <View style={styles.mealPickerHandle} />
                  <Text style={styles.mealPickerTitle}>Log to which meal?</Text>
                  <View style={styles.mealPickGrid}>
                    {MEAL_PICK.map(({ key, icon, label, color }) => (
                      <TouchableOpacity
                        key={key}
                        style={[styles.mealPickBtn, { borderColor: color + '55', backgroundColor: color + '14' }]}
                        activeOpacity={0.72}
                        onPress={async () => {
                          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          const logName = servings > 1 ? `${selected.name} (×${servings})` : selected.name;
                          await addFood(today, {
                            id: `${Date.now()}`,
                            icon: selected.icon,
                            name: logName,
                            kcal: selected.kcal * servings,
                            carbs: selected.carbs * servings,
                            protein: selected.protein * servings,
                            fat: selected.fat * servings,
                            unit: servings > 1 ? `${servings} servings` : 'serving',
                            meal: key,
                          });
                          await checkAndUpdateStreak(today);
                          await addXp(10);
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          Alert.alert('Logged ✓', `${logName} added to ${label}. +10 XP`);
                          setMealPickerOpen(false);
                          setSelected(null);
                        }}
                      >
                        <Text style={styles.mealPickIcon}>{icon}</Text>
                        <Text style={[styles.mealPickLabel, { color }]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}
          </SafeAreaView>
        )}
      </Modal>

      {/* Floating Plan-Shopping CTA — visible when plan mode is on and at least one recipe is picked */}
      {planMode && planSelected.size > 0 && (
        <View style={styles.planFloatBar}>
          <TouchableOpacity
            style={styles.planCancelBtn}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setPlanSelected(new Set());
              setPlanMode(false);
            }}
          >
            <Text style={styles.planCancelTxt}>Cancel</Text>
          </TouchableOpacity>
          <View style={{ flex: 2, borderRadius: radius.md, overflow: 'hidden' }}>
            <TouchableOpacity activeOpacity={0.85} onPress={submitPlan}>
              <LinearGradient
                colors={[colors.purple, colors.purpleGlow]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.planConfirmBtn}
              >
                <Ionicons name="cart" size={16} color={colors.white} />
                <Text style={styles.planConfirmTxt}>
                  Create Grocery List · {planSelected.size}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  fixedHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, overflow: 'hidden' },
  scroll: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.lg },

  appHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.lg, flex: 1 },
  iconBtn: { width: spacing.xl + spacing.sm, height: spacing.xl + spacing.sm, borderRadius: radius.pill, backgroundColor: colors.layer2, borderWidth: 1.5, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notifDot: { position: 'absolute', top: 8, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.rose },
  avatarDot: { position: 'absolute', top: -2, right: -2, width: 9, height: 9, borderRadius: radius.pill, backgroundColor: colors.rose, borderWidth: 1.5, borderColor: colors.bg },
  headingWrap: { position: 'absolute', left: 0, right: 0, top: spacing.xs, bottom: spacing.lg, alignItems: 'center', justifyContent: 'center', zIndex: 0 },
  heading: { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, width: spacing.xl + spacing.sm, zIndex: 1 },
  avatarBtn: { width: spacing.xl + spacing.sm, height: spacing.xl + spacing.sm, zIndex: 1 },
  avatarThumb: { width: spacing.xl + spacing.sm, height: spacing.xl + spacing.sm, borderRadius: radius.pill, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.purple2 },
  avatarInitial: { color: colors.white, fontSize: fontSize.sm + 1, fontWeight: '800' },

  // Budget banner
  budgetBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.green + '14', borderWidth: 1, borderColor: colors.green + '33', borderRadius: radius.lg, padding: spacing.md },
  budgetLeft: { gap: 3 },
  budgetLabel: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.green + 'b3' },
  budgetVal: { fontSize: fontSize.sm, color: colors.ink2 },
  budgetNum: { fontSize: fontSize.lg, fontWeight: '800', color: colors.green },
  budgetRing: { alignItems: 'center' },
  budgetPct: { fontSize: fontSize.lg, fontWeight: '800', color: colors.green },
  budgetPctLbl: { fontSize: fontSize.xs, color: colors.ink3 },

  // Search
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, paddingHorizontal: spacing.sm },
  searchIcon: { marginRight: spacing.xs },
  search: { flex: 1, color: colors.ink, fontSize: fontSize.base, paddingVertical: spacing.sm },

  // Filters
  filters: { flexGrow: 0 },
  filterChip: { borderWidth: 1, borderColor: colors.line2, borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginRight: spacing.xs },
  filterActive: { backgroundColor: colors.purple + '33', borderColor: colors.purple },
  filterText: { color: colors.ink2, fontSize: fontSize.sm },
  filterTextActive: { color: colors.lavender },

  sectionHdr: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.ink3 },

  // Recipe grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  recipeCard: { width: '47%', backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.xs },
  // Photo-hero variant (Mob Kitchen style) — square cube, photo fills,
  // bottom fades to page bg, title overlaid where photo "ends".
  recipeCardPhoto: {
    width: '47%',
    aspectRatio: 1,               // square cube — equal width and height
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line2,
    overflow: 'hidden',
    backgroundColor: colors.layer1,
    shadowColor: colors.purple,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  recipeCardPhotoImg: { width: '100%', height: '100%' },
  recipePhotoDietBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.purple + 'CC',   // purple @ 80% — readable over any photo
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  recipePhotoDietTxt: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  recipePhotoFooter: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    gap: 4,
  },
  recipePhotoName: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '800',
    letterSpacing: 0.2,
    lineHeight: fontSize.md + 4,
  },
  recipePhotoMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  recipePhotoMeta: { color: colors.ink2, fontSize: fontSize.xs, fontWeight: '600' },
  recipePhotoKcal: { color: colors.lavender, fontSize: fontSize.sm, fontWeight: '800' },
  recipeIcon: { fontSize: fontSize['2xl'] - 2, textAlign: 'center', marginBottom: spacing.xs },
  dietBadge: { alignSelf: 'flex-start', backgroundColor: colors.purple + '22', borderRadius: radius.xl, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  dietBadgeText: { color: colors.lavender, fontSize: fontSize.xs },
  recipeName: { color: colors.ink, fontSize: fontSize.sm, fontWeight: '600' },
  recipeMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recipeMeta: { color: colors.ink3, fontSize: fontSize.xs },
  recipeKcal: { color: colors.lavender, fontSize: fontSize.sm, fontWeight: '700' },
  recipeMacroRow: { flexDirection: 'row', gap: spacing.xs },
  recipeMacroTxt: { fontSize: fontSize.xs, fontWeight: '600', borderRadius: spacing.xs / 2, paddingHorizontal: 4, paddingVertical: 1 },
  recipeMacroP:   { color: colors.sky,   backgroundColor: colors.sky   + '22', borderWidth: 1, borderColor: colors.sky   + '55' },
  recipeMacroC:   { color: colors.honey, backgroundColor: colors.honey + '22', borderWidth: 1, borderColor: colors.honey + '55' },
  recipeMacroF:   { color: colors.rose,  backgroundColor: colors.rose  + '22', borderWidth: 1, borderColor: colors.rose  + '55' },

  // Modal
  modal: { flex: 1, backgroundColor: colors.bg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  closeBtn: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.layer2, alignItems: 'center', justifyContent: 'center' },
  modalMeal: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: colors.ink3 },
  addBtn: { borderRadius: radius.md, overflow: 'hidden' },
  addBtnGrad: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  addBtnTxt: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  modalScroll: { padding: spacing.lg, gap: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.lg },
  modalIcon: { fontSize: fontSize['2xl'] + 26, textAlign: 'center', marginBottom: spacing.sm },
  // Responsive hero — 300×180 on iPhone 13/14 (77% of width, 0.6 aspect).
  // Wrapper holds the sizing, rounded-corner clip, and background; the bottom-
  // fading LinearGradient inside melts the image edge into the page bg.
  // (Border + shadow dropped — overflow:hidden would clip the shadow on iOS
  // anyway, and the gradient handles the soft transition.)
  modalPhotoWrap: {
    width: MODAL_PHOTO_WIDTH,
    height: MODAL_PHOTO_HEIGHT,
    alignSelf: 'center',
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
    backgroundColor: colors.layer2,
  },
  modalPhoto: {
    width: MODAL_PHOTO_WIDTH,
    height: MODAL_PHOTO_HEIGHT,
  },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  modalTime: { fontSize: fontSize.sm, color: colors.ink3, textAlign: 'center' },
  modalMacros: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: spacing.md, backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  modalMacroPill: { alignItems: 'center', gap: 4 },
  modalMacroVal: { fontSize: fontSize.md, fontWeight: '700' },
  modalMacroLabel: { color: colors.ink3, fontSize: fontSize.xs },
  fitsBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.green + '11', borderWidth: 1, borderColor: colors.green + '44', borderRadius: radius.md, padding: spacing.sm },
  fitsTxt: { fontSize: fontSize.sm, color: colors.green, fontWeight: '500' },
  modalSection: {
    color: colors.ink,
    fontSize: fontSize.base,
    fontWeight: '700',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    textAlign: 'center',
  },
  // Two-column ingredients table — Amount | Ingredient with vertical divider.
  ingredientsTable: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radius.md,
    backgroundColor: colors.layer1,
    overflow: 'hidden',
  },
  ingredientHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.layer2,
    borderBottomWidth: 1,
    borderBottomColor: colors.line2,
  },
  ingredientHeaderQty: {
    width: 110,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    fontSize: fontSize.base,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  ingredientHeaderName: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    fontSize: fontSize.base,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  ingredientRow: { flexDirection: 'row', alignItems: 'center' },
  ingredientRowDivided: { borderBottomWidth: 1, borderBottomColor: colors.line },
  ingredientColSep: { width: 1, alignSelf: 'stretch', backgroundColor: colors.line },
  ingredientQty: {
    width: 110,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.lavender,
    textAlign: 'center',
  },
  ingredientTxt: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    color: colors.ink2,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  // Instructions — card matching the ingredients table, with bolder numbered chips.
  stepsCard: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radius.md,
    backgroundColor: colors.layer1,
    overflow: 'hidden',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 2,
  },
  stepRowDivided: { borderBottomWidth: 1, borderBottomColor: colors.line },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: colors.purple,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  stepNumTxt: { fontSize: fontSize.sm, fontWeight: '800', color: colors.ink2 },
  stepTxt: {
    flex: 1,
    color: colors.ink2,
    fontSize: fontSize.sm + 1,
    lineHeight: 22,
    marginTop: 3,
  },
  mealPickerRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md, flexWrap: 'wrap' },
  mealChip: { flex: 1, alignItems: 'center', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.line, borderWidth: 1, borderColor: colors.line2 },
  mealChipSel: { backgroundColor: colors.purpleTint, borderColor: colors.line3 },
  mealChipTxt: { fontSize: fontSize.xs, fontWeight: '600', color: colors.ink3 },
  mealChipTxtSel: { color: colors.lavender },
  logBtn: { borderRadius: radius.md, marginTop: spacing.md, overflow: 'hidden' },
  logBtnGrad: { padding: spacing.md, alignItems: 'center' },
  logBtnTxt: { color: colors.white, fontWeight: '700', fontSize: fontSize.base },

  // Meal picker grid — used inside the bottom-sheet meal picker.
  mealPickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mealPickBtn: { width: '47%', borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', gap: spacing.xs },
  mealPickIcon: { fontSize: fontSize.xl },
  mealPickLabel: { fontSize: fontSize.sm, fontWeight: '700' },

  // Tab switcher
  tabSwitcher: { flexDirection: 'row', backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, padding: 3, gap: 3 },
  tabBtn: { flex: 1, paddingVertical: spacing.xs, alignItems: 'center', borderRadius: radius.sm },
  tabBtnActive: { backgroundColor: colors.purple },
  tabBtnTxt: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink3 },
  tabBtnTxtActive: { color: colors.ink },

  // Food card
  foodCard: { width: '47%', backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.xs },
  foodIcon: { fontSize: fontSize['2xl'], textAlign: 'center', marginBottom: spacing.xs },
  foodCatBadge: { alignSelf: 'flex-start', backgroundColor: colors.teal + '22', borderRadius: radius.xl, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  foodCatText: { color: colors.teal, fontSize: fontSize.xs },
  foodName: { color: colors.ink, fontSize: fontSize.sm, fontWeight: '600' },
  foodKcal: { color: colors.lavender, fontSize: fontSize.sm, fontWeight: '700' },

  // Empty state
  emptyState: { width: '100%', alignItems: 'center', paddingVertical: spacing.xl },
  emptyIcon: { fontSize: fontSize['2xl'] },
  emptyTxt: { color: colors.ink3, marginTop: spacing.sm, fontSize: fontSize.sm },

  // Category browse
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  catCard: { width: '47%', backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, alignItems: 'center', gap: spacing.xs },
  catCardIcon: { width: 56, height: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  catCardEmoji: { fontSize: fontSize.xl },
  catCardName: { color: colors.ink, fontSize: fontSize.sm, fontWeight: '700', textAlign: 'center' },
  catCardCount: { fontSize: fontSize.xs, fontWeight: '600' },

  // Back row (inside category)
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  backRowTxt: { color: colors.purple3, fontSize: fontSize.sm, fontWeight: '600', marginRight: spacing.xs },
  catBackBadge: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  catBackLabel: { fontSize: fontSize.xs, fontWeight: '700' },

  // Micro pills in food modal
  microRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.layer2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.sm },
  microPill: { alignItems: 'center', gap: 3 },
  microVal: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink2 },
  microLabel: { color: colors.ink3, fontSize: fontSize.xs },

  // ── Plan Shopping (multi-recipe → grocery list) ─────────────────────────────
  // Header cart button shows purpleTint background while plan mode is active
  iconBtnActive: {
    backgroundColor: colors.purpleTint,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line3,
  },
  // Pick-count badge that floats top-right of the cart icon
  planCountBadge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planCountTxt: { color: colors.white, fontSize: fontSize.xs - 1, fontWeight: '800' },

  // Banner shown above the recipe list while plan mode is on
  planBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.purpleTint,
    borderWidth: 1,
    borderColor: colors.line3,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  planBannerTxt: { color: colors.lavender, fontSize: fontSize.sm, fontWeight: '600' },

  // Selected card highlight (used by recipeCard variants)
  recipeCardSelected: {
    backgroundColor: colors.purpleTint,
    borderColor: colors.line3,
  },
  // Empty circle in top-right of card while in plan mode (filled when picked)
  selectBadge: {
    position: 'absolute',
    top: spacing.xs + 2,
    right: spacing.xs + 2,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.line3,
    backgroundColor: colors.layer2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  selectBadgeOn: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },

  // Floating action bar — Cancel + Create Grocery List
  planFloatBar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.layer1,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radius.lg,
    padding: spacing.sm,
    shadowColor: colors.purple,
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  planCancelBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radius.md,
    backgroundColor: colors.layer2,
  },
  planCancelTxt: { color: colors.ink3, fontSize: fontSize.sm, fontWeight: '600' },
  planConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
  },
  planConfirmTxt: { color: colors.white, fontSize: fontSize.sm, fontWeight: '800' },

  // Compact action pills in recipe detail modal header — opposite the X.
  // The Serving stepper has − and + buttons either side of the count display
  // (range 1–100); macros, ingredient qty, diary log, and grocery add all
  // scale by the count. The "+ diary" pill opens the meal-picker sheet;
  // the "+ cart" pill adds ingredients to the grocery list.
  headerActions: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginLeft: spacing.sm },
  servingStepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.purpleTint,
    borderWidth: 1,
    borderColor: colors.line3,
    overflow: 'hidden',
  },
  servingStepBtn: {
    width: 30,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  servingStepTxt: {
    color: colors.lavender,
    fontSize: fontSize.xs,
    fontWeight: '800',
    paddingHorizontal: 4,
    minWidth: 70,
    textAlign: 'center',
  },
  addDiaryHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 36,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.purpleTint,
    borderWidth: 1,
    borderColor: colors.line3,
  },
  addGroceryHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: spacing.xl + spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.purpleTint,
    borderWidth: 1,
    borderColor: colors.line3,
  },

  // Bottom-sheet meal picker overlay — slides up from the bottom of the recipe
  // detail modal when the "+ diary" header button is tapped. Tapping the dim
  // backdrop closes the sheet.
  mealPickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.dim,
    justifyContent: 'flex-end',
  },
  mealPickerSheet: {
    backgroundColor: colors.layer1,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.line2,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg + spacing.md,
    gap: spacing.sm,
  },
  mealPickerHandle: {
    width: 44,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.line3,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  mealPickerTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
});

import { useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  Modal, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useDiaryStore } from '../../src/store/diaryStore';
import { useAuthStore } from '../../src/store/authStore';
import { colors, spacing, fontSize, radius } from '../../src/theme';
import { useAppStore } from '../../src/store/appStore';
import { generateMealPlan } from '../../src/lib/api';
import { FOOD_DATABASE, type LocalFood } from '../../src/lib/foodDatabase';

const DIET_FILTERS = ['All', 'Breakfast', 'Lunch', 'Dinner', 'Snack', 'High Protein', 'Low Carb', 'Vegan', 'Keto', 'Vegetarian', 'Mediterranean'];

const RECIPES = [
  { id: '1',  icon: '🥗',  name: 'Greek Salad',          diet: 'Vegan',       meal: 'Lunch',     kcal: 220, carbs: 18, protein: 6,  fat: 14, time: '10 min', goal: 'weight_loss',   ingredients: [{ qty: '200g', name: 'Cucumber' }, { qty: '250g', name: 'Tomato' }, { qty: '50g', name: 'Kalamata olives' }, { qty: '80g', name: 'Feta cheese' }, { qty: '60g', name: 'Red onion' }, { qty: '2 tbsp (30ml)', name: 'Olive oil' }], steps: ['Chop all vegetables.', 'Combine in a bowl.', 'Add feta and olives.', 'Drizzle with olive oil and season.'] },
  { id: '2',  icon: '🍗',  name: 'Grilled Chicken',       diet: 'High Protein', meal: 'Dinner',   kcal: 320, carbs: 2,  protein: 52, fat: 10, time: '25 min', goal: 'muscle_gain',   ingredients: [{ qty: '200g', name: 'Chicken breast' }, { qty: '1 tbsp (15ml)', name: 'Olive oil' }, { qty: '2 cloves', name: 'Garlic' }, { qty: '½ piece', name: 'Lemon' }, { qty: '2 sprigs', name: 'Rosemary' }], steps: ['Marinate chicken with olive oil, garlic, and lemon.', 'Grill for 12 min each side.', 'Rest 5 min before serving.'] },
  { id: '3',  icon: '🥑',  name: 'Avocado Toast',         diet: 'Vegetarian',  meal: 'Breakfast', kcal: 290, carbs: 28, protein: 8,  fat: 17, time: '8 min',  goal: 'balanced',      ingredients: [{ qty: '2 slices (80g)', name: 'Sourdough bread' }, { qty: '1 medium (150g)', name: 'Avocado' }, { qty: '1 tsp (5ml)', name: 'Lemon juice' }, { qty: '¼ tsp', name: 'Red pepper flakes' }, { qty: '¼ tsp', name: 'Salt' }], steps: ['Toast bread until golden.', 'Mash avocado with lemon juice and salt.', 'Spread on toast, top with pepper flakes.'] },
  { id: '4',  icon: '🐟',  name: 'Salmon Bowl',           diet: 'High Protein', meal: 'Lunch',    kcal: 450, carbs: 32, protein: 44, fat: 16, time: '20 min', goal: 'muscle_gain',   ingredients: [{ qty: '150g', name: 'Salmon fillet' }, { qty: '100g (dry)', name: 'Brown rice' }, { qty: '80g', name: 'Edamame' }, { qty: '2 tbsp (30ml)', name: 'Soy sauce' }, { qty: '1 tsp', name: 'Sesame seeds' }, { qty: '60g', name: 'Cucumber' }], steps: ['Cook rice.', 'Pan-sear salmon 4 min each side.', 'Assemble bowl with all ingredients.', 'Drizzle soy sauce and sprinkle sesame seeds.'] },
  { id: '5',  icon: '🥚',  name: 'Egg White Omelette',    diet: 'Keto',        meal: 'Breakfast', kcal: 180, carbs: 3,  protein: 28, fat: 6,  time: '10 min', goal: 'weight_loss',   ingredients: [{ qty: '4 whites (120ml)', name: 'Egg whites' }, { qty: '50g', name: 'Spinach' }, { qty: '60g', name: 'Bell pepper' }, { qty: '¼ tsp', name: 'Salt' }, { qty: '¼ tsp', name: 'Pepper' }], steps: ['Whisk egg whites with salt.', 'Sauté vegetables 2 min.', 'Pour egg whites over vegetables.', 'Cook until set and fold.'] },
  { id: '6',  icon: '🍲',  name: 'Lentil Soup',           diet: 'Vegan',       meal: 'Dinner',    kcal: 280, carbs: 42, protein: 16, fat: 4,  time: '35 min', goal: 'balanced',      ingredients: [{ qty: '100g (dry)', name: 'Red lentils' }, { qty: '1 medium (100g)', name: 'Onion' }, { qty: '100g', name: 'Carrots' }, { qty: '1 tsp', name: 'Cumin' }, { qty: '500ml', name: 'Vegetable stock' }, { qty: '½ piece', name: 'Lemon' }], steps: ['Sauté onion and carrots.', 'Add lentils, cumin, and stock.', 'Simmer 25 min.', 'Blend partially and squeeze lemon.'] },
  { id: '7',  icon: '🥣',  name: 'Overnight Oats',        diet: 'Vegetarian',  meal: 'Breakfast', kcal: 350, carbs: 55, protein: 12, fat: 8,  time: '5 min',  goal: 'balanced',      ingredients: [{ qty: '80g', name: 'Rolled oats' }, { qty: '200ml', name: 'Almond milk' }, { qty: '1 tbsp (10g)', name: 'Chia seeds' }, { qty: '1 medium (120g)', name: 'Banana' }, { qty: '1 tbsp (20ml)', name: 'Honey' }], steps: ['Mix oats, milk and chia seeds.', 'Refrigerate overnight.', 'Top with banana and honey before serving.'] },
  { id: '8',  icon: '🌮',  name: 'Chicken Tacos',         diet: 'High Protein', meal: 'Dinner',   kcal: 420, carbs: 38, protein: 36, fat: 12, time: '20 min', goal: 'muscle_gain',   ingredients: [{ qty: '200g', name: 'Chicken thighs' }, { qty: '3 pieces', name: 'Corn tortillas' }, { qty: '½ piece', name: 'Lime' }, { qty: '10g', name: 'Cilantro' }, { qty: '3 tbsp (45ml)', name: 'Salsa' }, { qty: '½ medium (75g)', name: 'Avocado' }], steps: ['Season and grill chicken.', 'Slice into strips.', 'Warm tortillas and assemble tacos.', 'Top with salsa, avocado, and lime.'] },
  { id: '9',  icon: '🥜',  name: 'Peanut Butter Smoothie', diet: 'High Protein', meal: 'Breakfast', kcal: 380, carbs: 30, protein: 22, fat: 18, time: '5 min', goal: 'muscle_gain', ingredients: [{ qty: '1 medium (120g)', name: 'Banana' }, { qty: '2 tbsp (32g)', name: 'Peanut butter' }, { qty: '1 scoop (30g)', name: 'Protein powder' }, { qty: '250ml', name: 'Oat milk' }, { qty: '1 tsp (7ml)', name: 'Honey' }], steps: ['Add all ingredients to blender.', 'Blend until smooth.', 'Serve immediately.'] },
  { id: '10', icon: '🫘',  name: 'Black Bean Bowl',        diet: 'Vegan',       meal: 'Lunch',     kcal: 310, carbs: 48, protein: 14, fat: 6,  time: '15 min', goal: 'weight_loss',   ingredients: [{ qty: '150g (cooked)', name: 'Black beans' }, { qty: '80g (dry)', name: 'Brown rice' }, { qty: '60g', name: 'Corn' }, { qty: '80g', name: 'Bell peppers' }, { qty: '1 tsp', name: 'Cumin' }, { qty: '½ piece', name: 'Lime' }], steps: ['Warm beans with cumin.', 'Cook rice.', 'Assemble bowl with all ingredients.', 'Squeeze lime over the top.'] },
  // Breakfast
  { id: '11', icon: '🥞', name: 'Protein Pancakes', diet: 'High Protein', meal: 'Breakfast', kcal: 340, carbs: 38, protein: 28, fat: 8, time: '15 min', goal: 'muscle_gain', ingredients: [{ qty: '80g', name: 'Oat flour' }, { qty: '2 pieces', name: 'Eggs' }, { qty: '1 medium (120g)', name: 'Banana' }, { qty: '1 scoop (30g)', name: 'Protein powder' }, { qty: '1 tsp', name: 'Baking powder' }, { qty: '100ml', name: 'Almond milk' }], steps: ['Mash banana and mix with eggs.', 'Add oat flour, protein powder, and baking powder.', 'Add milk to desired consistency.', 'Cook in non-stick pan, 2 min per side.'] },
  { id: '12', icon: '🍳', name: 'Scrambled Eggs', diet: 'Keto', meal: 'Breakfast', kcal: 220, carbs: 2, protein: 16, fat: 16, time: '8 min', goal: 'weight_loss', ingredients: [{ qty: '3 pieces', name: 'Eggs' }, { qty: '1 tsp (5g)', name: 'Butter' }, { qty: '¼ tsp', name: 'Salt' }, { qty: '¼ tsp', name: 'Pepper' }, { qty: '5g', name: 'Chives' }], steps: ['Whisk eggs with salt and pepper.', 'Melt butter in pan over low heat.', 'Add eggs and fold gently.', 'Remove from heat when just set.'] },
  { id: '13', icon: '🫐', name: 'Berry Smoothie Bowl', diet: 'Vegan', meal: 'Breakfast', kcal: 310, carbs: 58, protein: 8, fat: 5, time: '5 min', goal: 'weight_loss', ingredients: [{ qty: '150g', name: 'Frozen mixed berries' }, { qty: '1 medium (120g)', name: 'Banana' }, { qty: '80ml', name: 'Oat milk' }, { qty: '30g', name: 'Granola' }, { qty: '1 tbsp (10g)', name: 'Chia seeds' }, { qty: '1 tsp (7ml)', name: 'Honey' }], steps: ['Blend frozen berries and banana with minimal milk.', 'Pour into bowl.', 'Top with granola, chia seeds, and honey.'] },
  { id: '14', icon: '🥐', name: 'Greek Yogurt Parfait', diet: 'Vegetarian', meal: 'Breakfast', kcal: 280, carbs: 35, protein: 18, fat: 7, time: '5 min', goal: 'balanced', ingredients: [{ qty: '200g', name: 'Greek yogurt' }, { qty: '40g', name: 'Granola' }, { qty: '100g', name: 'Mixed berries' }, { qty: '1 tbsp (20ml)', name: 'Honey' }, { qty: '20g', name: 'Almonds' }], steps: ['Layer yogurt in a glass.', 'Add granola and berries.', 'Drizzle with honey and top with almonds.'] },
  { id: '15', icon: '🍵', name: 'Matcha Oatmeal', diet: 'Vegan', meal: 'Breakfast', kcal: 295, carbs: 52, protein: 9, fat: 6, time: '10 min', goal: 'balanced', ingredients: [{ qty: '80g', name: 'Rolled oats' }, { qty: '1 tsp (3g)', name: 'Matcha powder' }, { qty: '250ml', name: 'Almond milk' }, { qty: '1 tbsp (15ml)', name: 'Maple syrup' }, { qty: '1 tbsp (10g)', name: 'Hemp seeds' }, { qty: '1 medium (120g)', name: 'Banana' }], steps: ['Cook oats with almond milk.', 'Stir in matcha powder and maple syrup.', 'Top with hemp seeds and sliced banana.'] },
  { id: '16', icon: '🥚', name: 'Veggie Frittata', diet: 'Vegetarian', meal: 'Breakfast', kcal: 260, carbs: 8, protein: 20, fat: 16, time: '20 min', goal: 'weight_loss', ingredients: [{ qty: '3 pieces', name: 'Eggs' }, { qty: '100g', name: 'Zucchini' }, { qty: '80g', name: 'Bell pepper' }, { qty: '60g', name: 'Onion' }, { qty: '40g', name: 'Feta cheese' }, { qty: '1 tbsp (15ml)', name: 'Olive oil' }], steps: ['Saute vegetables in oven-safe pan.', 'Whisk eggs and pour over vegetables.', 'Add crumbled feta.', 'Bake at 180C for 12 min until set.'] },
  // Lunch
  { id: '17', icon: '🌯', name: 'Turkey Wrap', diet: 'High Protein', meal: 'Lunch', kcal: 380, carbs: 32, protein: 34, fat: 12, time: '10 min', goal: 'muscle_gain', ingredients: [{ qty: '1 piece (65g)', name: 'Whole wheat tortilla' }, { qty: '120g', name: 'Turkey slices' }, { qty: '½ medium (75g)', name: 'Avocado' }, { qty: '20g', name: 'Lettuce' }, { qty: '1 medium (120g)', name: 'Tomato' }, { qty: '1 tsp', name: 'Mustard' }], steps: ['Lay tortilla flat.', 'Layer turkey, avocado, lettuce, tomato.', 'Drizzle mustard.', 'Roll tightly and slice.'] },
  { id: '18', icon: '🥙', name: 'Falafel Pita', diet: 'Vegan', meal: 'Lunch', kcal: 420, carbs: 56, protein: 14, fat: 16, time: '20 min', goal: 'balanced', ingredients: [{ qty: '4 pieces (160g)', name: 'Falafel balls' }, { qty: '1 piece (75g)', name: 'Pita bread' }, { qty: '3 tbsp (60g)', name: 'Hummus' }, { qty: '60g', name: 'Cucumber' }, { qty: '1 medium (120g)', name: 'Tomato' }, { qty: '2 tbsp (30ml)', name: 'Tahini' }], steps: ['Warm falafel in oven 10 min.', 'Open pita and spread hummus.', 'Add falafel and vegetables.', 'Drizzle with tahini.'] },
  { id: '19', icon: '🍱', name: 'Tuna Nicoise', diet: 'High Protein', meal: 'Lunch', kcal: 390, carbs: 22, protein: 38, fat: 16, time: '15 min', goal: 'weight_loss', ingredients: [{ qty: '150g', name: 'Canned tuna' }, { qty: '100g', name: 'Green beans' }, { qty: '100g', name: 'Cherry tomatoes' }, { qty: '1 piece', name: 'Boiled egg' }, { qty: '30g', name: 'Olives' }, { qty: '2 tbsp (30ml)', name: 'Dijon dressing' }], steps: ['Blanch green beans 3 min.', 'Arrange all ingredients on plate.', 'Drizzle with Dijon vinaigrette.'] },
  { id: '20', icon: '🫙', name: 'Mason Jar Salad', diet: 'Vegetarian', meal: 'Lunch', kcal: 340, carbs: 28, protein: 14, fat: 20, time: '10 min', goal: 'weight_loss', ingredients: [{ qty: '80g', name: 'Mixed greens' }, { qty: '80g', name: 'Cherry tomatoes' }, { qty: '80g', name: 'Cucumber' }, { qty: '80g', name: 'Chickpeas' }, { qty: '40g', name: 'Feta' }, { qty: '2 tbsp (30ml)', name: 'Balsamic dressing' }], steps: ['Layer dressing at bottom.', 'Add chickpeas and tomatoes.', 'Add cucumber and greens on top.', 'Seal and refrigerate until ready.'] },
  { id: '21', icon: '🍜', name: 'Miso Soup Ramen', diet: 'Vegetarian', meal: 'Lunch', kcal: 360, carbs: 50, protein: 16, fat: 8, time: '20 min', goal: 'balanced', ingredients: [{ qty: '80g (dry)', name: 'Ramen noodles' }, { qty: '1 tbsp (15g)', name: 'Miso paste' }, { qty: '100g', name: 'Tofu' }, { qty: '80g', name: 'Bok choy' }, { qty: '10g', name: 'Green onion' }, { qty: '1 tsp (5ml)', name: 'Sesame oil' }], steps: ['Boil noodles per package.', 'Dissolve miso in hot water.', 'Add cubed tofu and bok choy.', 'Top with green onion and sesame oil.'] },
  { id: '22', icon: '🥗', name: 'Quinoa Power Bowl', diet: 'Vegan', meal: 'Lunch', kcal: 400, carbs: 52, protein: 16, fat: 14, time: '25 min', goal: 'balanced', ingredients: [{ qty: '80g (dry)', name: 'Quinoa' }, { qty: '150g', name: 'Roasted sweet potato' }, { qty: '60g', name: 'Spinach' }, { qty: '20g', name: 'Pumpkin seeds' }, { qty: '3 tbsp (45ml)', name: 'Lemon tahini dressing' }, { qty: '½ medium (75g)', name: 'Avocado' }], steps: ['Cook quinoa.', 'Roast sweet potato cubes at 200C.', 'Assemble bowl and drizzle tahini dressing.'] },
  { id: '23', icon: '🍗', name: 'Caesar Salad with Chicken', diet: 'High Protein', meal: 'Lunch', kcal: 430, carbs: 12, protein: 46, fat: 22, time: '20 min', goal: 'muscle_gain', ingredients: [{ qty: '150g', name: 'Romaine lettuce' }, { qty: '180g', name: 'Grilled chicken' }, { qty: '30g', name: 'Parmesan' }, { qty: '30g', name: 'Croutons' }, { qty: '3 tbsp (45ml)', name: 'Caesar dressing' }, { qty: '½ piece', name: 'Lemon' }], steps: ['Grill chicken and slice.', 'Tear lettuce and toss with dressing.', 'Add chicken and croutons.', 'Top with parmesan and lemon.'] },
  { id: '24', icon: '🫔', name: 'Veggie Burrito Bowl', diet: 'Vegan', meal: 'Lunch', kcal: 370, carbs: 60, protein: 12, fat: 8, time: '15 min', goal: 'balanced', ingredients: [{ qty: '100g (dry)', name: 'Brown rice' }, { qty: '150g (cooked)', name: 'Black beans' }, { qty: '80g', name: 'Corn' }, { qty: '4 tbsp (60ml)', name: 'Salsa' }, { qty: '80g', name: 'Guacamole' }, { qty: '½ piece', name: 'Lime' }], steps: ['Cook rice.', 'Warm beans with cumin.', 'Assemble bowl with all toppings.', 'Squeeze lime and add salsa.'] },
  // Dinner
  { id: '25', icon: '🥩', name: 'Beef Stir Fry', diet: 'High Protein', meal: 'Dinner', kcal: 480, carbs: 28, protein: 44, fat: 20, time: '20 min', goal: 'muscle_gain', ingredients: [{ qty: '200g', name: 'Beef strips' }, { qty: '100g', name: 'Broccoli' }, { qty: '80g', name: 'Bell pepper' }, { qty: '3 tbsp (45ml)', name: 'Soy sauce' }, { qty: '1 tsp (5g)', name: 'Ginger' }, { qty: '2 cloves', name: 'Garlic' }, { qty: '100g (dry)', name: 'Rice' }], steps: ['Cook rice.', 'Stir fry beef in hot wok until brown.', 'Add vegetables and stir fry 3 min.', 'Add soy sauce, ginger, garlic.', 'Serve over rice.'] },
  { id: '26', icon: '🐠', name: 'Baked Cod', diet: 'High Protein', meal: 'Dinner', kcal: 310, carbs: 8, protein: 46, fat: 10, time: '25 min', goal: 'weight_loss', ingredients: [{ qty: '200g', name: 'Cod fillet' }, { qty: '½ piece', name: 'Lemon' }, { qty: '1 tbsp (15g)', name: 'Capers' }, { qty: '1 tbsp (15ml)', name: 'Olive oil' }, { qty: '2 cloves', name: 'Garlic' }, { qty: '5g', name: 'Parsley' }], steps: ['Preheat oven to 200C.', 'Place cod in baking dish with olive oil and lemon.', 'Top with capers and garlic.', 'Bake 18 min.', 'Garnish with parsley.'] },
  { id: '27', icon: '🍲', name: 'Chickpea Curry', diet: 'Vegan', meal: 'Dinner', kcal: 380, carbs: 54, protein: 14, fat: 10, time: '30 min', goal: 'balanced', ingredients: [{ qty: '200g (cooked)', name: 'Chickpeas' }, { qty: '200ml', name: 'Coconut milk' }, { qty: '150g', name: 'Tomatoes' }, { qty: '1 tbsp (8g)', name: 'Curry powder' }, { qty: '1 medium (100g)', name: 'Onion' }, { qty: '2 cloves', name: 'Garlic' }, { qty: '80g (dry)', name: 'Basmati rice' }], steps: ['Saute onion, garlic with curry powder.', 'Add tomatoes and chickpeas.', 'Pour in coconut milk and simmer 20 min.', 'Serve over rice.'] },
  { id: '28', icon: '🫕', name: 'Turkey Meatballs', diet: 'High Protein', meal: 'Dinner', kcal: 420, carbs: 30, protein: 48, fat: 12, time: '35 min', goal: 'muscle_gain', ingredients: [{ qty: '250g', name: 'Ground turkey' }, { qty: '30g', name: 'Breadcrumbs' }, { qty: '1 piece', name: 'Egg' }, { qty: '20g', name: 'Parmesan' }, { qty: '150ml', name: 'Marinara sauce' }, { qty: '100g (dry)', name: 'Spaghetti' }], steps: ['Mix turkey with breadcrumbs, egg, parmesan.', 'Form into balls.', 'Bake at 190C for 20 min.', 'Simmer in marinara sauce.', 'Serve over pasta.'] },
  { id: '29', icon: '🥬', name: 'Stuffed Bell Peppers', diet: 'Vegetarian', meal: 'Dinner', kcal: 320, carbs: 38, protein: 16, fat: 10, time: '40 min', goal: 'balanced', ingredients: [{ qty: '2 pieces', name: 'Bell peppers' }, { qty: '80g (dry)', name: 'Quinoa' }, { qty: '100g (cooked)', name: 'Black beans' }, { qty: '100g', name: 'Tomatoes' }, { qty: '60g', name: 'Corn' }, { qty: '1 tsp', name: 'Cumin' }, { qty: '30g', name: 'Cheese' }], steps: ['Cook quinoa with cumin.', 'Mix with beans, tomatoes, corn.', 'Hollow out peppers and fill.', 'Top with cheese.', 'Bake at 180C for 25 min.'] },
  { id: '30', icon: '🍝', name: 'Pasta Primavera', diet: 'Vegetarian', meal: 'Dinner', kcal: 440, carbs: 68, protein: 14, fat: 12, time: '25 min', goal: 'balanced', ingredients: [{ qty: '100g (dry)', name: 'Penne pasta' }, { qty: '100g', name: 'Cherry tomatoes' }, { qty: '100g', name: 'Zucchini' }, { qty: '80g', name: 'Asparagus' }, { qty: '2 tbsp (30ml)', name: 'Olive oil' }, { qty: '30g', name: 'Parmesan' }, { qty: '10g', name: 'Fresh basil' }], steps: ['Cook pasta al dente.', 'Saute vegetables in olive oil.', 'Toss pasta with vegetables.', 'Add parmesan and fresh basil.'] },
  { id: '31', icon: '🍛', name: 'Thai Green Curry', diet: 'High Protein', meal: 'Dinner', kcal: 460, carbs: 38, protein: 36, fat: 18, time: '30 min', goal: 'muscle_gain', ingredients: [{ qty: '200g', name: 'Chicken breast' }, { qty: '2 tbsp (30g)', name: 'Green curry paste' }, { qty: '250ml', name: 'Coconut milk' }, { qty: '80g', name: 'Bamboo shoots' }, { qty: '10g', name: 'Fresh basil' }, { qty: '100g (dry)', name: 'Jasmine rice' }], steps: ['Fry curry paste 1 min.', 'Add coconut milk and simmer.', 'Add chicken pieces and cook through.', 'Add bamboo shoots and basil.', 'Serve over jasmine rice.'] },
  { id: '32', icon: '🫘', name: 'Kidney Bean Chili', diet: 'Vegan', meal: 'Dinner', kcal: 350, carbs: 54, protein: 16, fat: 6, time: '35 min', goal: 'balanced', ingredients: [{ qty: '200g (cooked)', name: 'Kidney beans' }, { qty: '200g', name: 'Chopped tomatoes' }, { qty: '1 medium (100g)', name: 'Onion' }, { qty: '2 tsp (6g)', name: 'Chili powder' }, { qty: '1 tsp', name: 'Cumin' }, { qty: '100g', name: 'Bell pepper' }, { qty: '1 piece', name: 'Cornbread' }], steps: ['Saute onion and peppers.', 'Add spices and cook 1 min.', 'Add beans and tomatoes.', 'Simmer 25 min.', 'Serve with cornbread.'] },
  // Snacks
  { id: '33', icon: '🍏', name: 'Apple & Almond Butter', diet: 'Vegan', meal: 'Snack', kcal: 190, carbs: 26, protein: 4, fat: 10, time: '2 min', goal: 'balanced', ingredients: [{ qty: '1 medium (180g)', name: 'Apple' }, { qty: '2 tbsp (32g)', name: 'Almond butter' }], steps: ['Slice apple.', 'Serve with 2 tbsp almond butter for dipping.'] },
  { id: '34', icon: '🥜', name: 'Trail Mix', diet: 'Vegan', meal: 'Snack', kcal: 210, carbs: 18, protein: 6, fat: 14, time: '1 min', goal: 'muscle_gain', ingredients: [{ qty: '40g', name: 'Mixed nuts' }, { qty: '20g', name: 'Dried cranberries' }, { qty: '10g', name: 'Dark chocolate chips' }, { qty: '15g', name: 'Pumpkin seeds' }], steps: ['Mix all ingredients together.', 'Store in a container.'] },
  { id: '35', icon: '🧀', name: 'Cottage Cheese & Berries', diet: 'Vegetarian', meal: 'Snack', kcal: 160, carbs: 16, protein: 18, fat: 3, time: '2 min', goal: 'weight_loss', ingredients: [{ qty: '200g', name: 'Cottage cheese' }, { qty: '80g', name: 'Mixed berries' }, { qty: '1 tsp (7ml)', name: 'Honey' }], steps: ['Spoon cottage cheese into a bowl.', 'Top with berries and a drizzle of honey.'] },
  { id: '36', icon: '🥒', name: 'Hummus & Veggies', diet: 'Vegan', meal: 'Snack', kcal: 140, carbs: 16, protein: 6, fat: 7, time: '5 min', goal: 'weight_loss', ingredients: [{ qty: '4 tbsp (80g)', name: 'Hummus' }, { qty: '100g', name: 'Cucumber' }, { qty: '80g', name: 'Carrot sticks' }, { qty: '80g', name: 'Bell pepper strips' }, { qty: '60g', name: 'Celery' }], steps: ['Cut vegetables into sticks.', 'Serve with hummus for dipping.'] },
  { id: '37', icon: '🍫', name: 'Protein Energy Balls', diet: 'Vegetarian', meal: 'Snack', kcal: 180, carbs: 22, protein: 8, fat: 7, time: '15 min', goal: 'muscle_gain', ingredients: [{ qty: '80g', name: 'Oats' }, { qty: '3 tbsp (48g)', name: 'Peanut butter' }, { qty: '2 tbsp (40ml)', name: 'Honey' }, { qty: '1 scoop (30g)', name: 'Protein powder' }, { qty: '20g', name: 'Dark chocolate chips' }], steps: ['Mix all ingredients together.', 'Roll into balls.', 'Refrigerate for 30 min to firm up.'] },
  { id: '38', icon: '🫐', name: 'Blueberry Chia Pudding', diet: 'Vegan', meal: 'Snack', kcal: 200, carbs: 28, protein: 6, fat: 8, time: '5 min', goal: 'balanced', ingredients: [{ qty: '3 tbsp (30g)', name: 'Chia seeds' }, { qty: '250ml', name: 'Almond milk' }, { qty: '80g', name: 'Blueberries' }, { qty: '1 tbsp (15ml)', name: 'Maple syrup' }, { qty: '½ tsp (2ml)', name: 'Vanilla extract' }], steps: ['Mix chia seeds with almond milk.', 'Add maple syrup and vanilla.', 'Refrigerate overnight.', 'Top with blueberries.'] },
  // High Protein extras
  { id: '39', icon: '🥩', name: 'Steak & Roasted Veg', diet: 'High Protein', meal: 'Dinner', kcal: 520, carbs: 20, protein: 52, fat: 26, time: '30 min', goal: 'muscle_gain', ingredients: [{ qty: '250g', name: 'Sirloin steak' }, { qty: '150g', name: 'Sweet potato' }, { qty: '150g', name: 'Broccoli' }, { qty: '2 tbsp (30ml)', name: 'Olive oil' }, { qty: '1 sprig', name: 'Rosemary' }, { qty: '2 cloves', name: 'Garlic' }], steps: ['Roast sweet potato and broccoli at 200C.', 'Season steak and cook to desired doneness.', 'Rest steak 5 min before slicing.', 'Serve with roasted vegetables.'] },
  { id: '40', icon: '🐟', name: 'Tuna Stuffed Avocado', diet: 'Keto', meal: 'Lunch', kcal: 340, carbs: 8, protein: 28, fat: 22, time: '10 min', goal: 'weight_loss', ingredients: [{ qty: '150g', name: 'Canned tuna' }, { qty: '1 medium (200g)', name: 'Avocado' }, { qty: '1 tbsp (15ml)', name: 'Lemon juice' }, { qty: '30g', name: 'Red onion' }, { qty: '40g', name: 'Celery' }, { qty: '1 tsp', name: 'Dijon mustard' }], steps: ['Mix tuna with lemon, onion, celery, mustard.', 'Halve avocado and remove pit.', 'Fill avocado halves with tuna mixture.'] },
  { id: '41', icon: '🍳', name: 'Shakshuka', diet: 'Vegetarian', meal: 'Breakfast', kcal: 290, carbs: 18, protein: 18, fat: 16, time: '25 min', goal: 'balanced', ingredients: [{ qty: '2 pieces', name: 'Eggs' }, { qty: '200g', name: 'Canned tomatoes' }, { qty: '80g', name: 'Bell pepper' }, { qty: '60g', name: 'Onion' }, { qty: '½ tsp', name: 'Cumin' }, { qty: '½ tsp', name: 'Paprika' }, { qty: '30g', name: 'Feta' }], steps: ['Saute onion and pepper.', 'Add spices and tomatoes, simmer 10 min.', 'Make wells and crack eggs in.', 'Cover and cook until whites set.', 'Top with feta.'] },
  { id: '42', icon: '🥗', name: 'Edamame Salad', diet: 'Vegan', meal: 'Lunch', kcal: 310, carbs: 28, protein: 18, fat: 14, time: '10 min', goal: 'balanced', ingredients: [{ qty: '120g', name: 'Edamame' }, { qty: '100g', name: 'Red cabbage' }, { qty: '80g', name: 'Mango' }, { qty: '10g', name: 'Cilantro' }, { qty: '2 tbsp (30ml)', name: 'Sesame dressing' }, { qty: '1 tsp', name: 'Sesame seeds' }], steps: ['Cook edamame and cool.', 'Shred cabbage and cube mango.', 'Toss with cilantro and sesame dressing.', 'Top with sesame seeds.'] },
  { id: '43', icon: '🍗', name: 'Chicken Shawarma Bowl', diet: 'High Protein', meal: 'Dinner', kcal: 490, carbs: 42, protein: 48, fat: 14, time: '35 min', goal: 'muscle_gain', ingredients: [{ qty: '200g', name: 'Chicken thighs' }, { qty: '1 tsp', name: 'Cumin' }, { qty: '½ tsp', name: 'Turmeric' }, { qty: '1 tsp', name: 'Paprika' }, { qty: '1 piece (75g)', name: 'Pita' }, { qty: '2 tbsp (30ml)', name: 'Tahini' }, { qty: '100g', name: 'Tomato' }, { qty: '10g', name: 'Parsley' }], steps: ['Marinate chicken with spices overnight.', 'Grill or pan cook chicken.', 'Slice and serve in bowl with pita.', 'Drizzle tahini and add tomato and parsley.'] },
  { id: '44', icon: '🫙', name: 'White Bean Soup', diet: 'Vegan', meal: 'Dinner', kcal: 290, carbs: 44, protein: 14, fat: 6, time: '30 min', goal: 'balanced', ingredients: [{ qty: '200g (cooked)', name: 'White beans' }, { qty: '60g', name: 'Kale' }, { qty: '80g', name: 'Carrots' }, { qty: '60g', name: 'Celery' }, { qty: '3 cloves', name: 'Garlic' }, { qty: '500ml', name: 'Vegetable broth' }, { qty: '1 sprig', name: 'Rosemary' }], steps: ['Saute carrots, celery, garlic.', 'Add beans, broth, rosemary.', 'Simmer 20 min.', 'Add kale and cook 5 min more.'] },
  { id: '45', icon: '🥑', name: 'Keto Avocado Salad', diet: 'Keto', meal: 'Lunch', kcal: 360, carbs: 10, protein: 14, fat: 30, time: '10 min', goal: 'weight_loss', ingredients: [{ qty: '1 medium (200g)', name: 'Avocado' }, { qty: '100g', name: 'Cherry tomatoes' }, { qty: '100g', name: 'Cucumber' }, { qty: '50g', name: 'Feta' }, { qty: '2 tbsp (30ml)', name: 'Olive oil' }, { qty: '½ piece', name: 'Lemon' }, { qty: '5g', name: 'Fresh basil' }], steps: ['Cube avocado and combine with tomatoes.', 'Add cucumber and feta.', 'Dress with olive oil and lemon.', 'Top with fresh basil.'] },
  { id: '46', icon: '🐚', name: 'Shrimp Tacos', diet: 'High Protein', meal: 'Dinner', kcal: 400, carbs: 36, protein: 38, fat: 12, time: '20 min', goal: 'muscle_gain', ingredients: [{ qty: '200g', name: 'Shrimp' }, { qty: '3 pieces', name: 'Corn tortillas' }, { qty: '80g', name: 'Cabbage slaw' }, { qty: '½ piece', name: 'Lime' }, { qty: '10g', name: 'Cilantro' }, { qty: '2 tbsp (30ml)', name: 'Sriracha mayo' }], steps: ['Season and saute shrimp 2 min each side.', 'Warm tortillas.', 'Fill with shrimp and cabbage slaw.', 'Drizzle with sriracha mayo and lime juice.'] },
  { id: '47', icon: '🫑', name: 'Stuffed Zucchini Boats', diet: 'Low Carb', meal: 'Dinner', kcal: 310, carbs: 14, protein: 28, fat: 16, time: '35 min', goal: 'weight_loss', ingredients: [{ qty: '2 medium (400g)', name: 'Zucchini' }, { qty: '150g', name: 'Ground beef' }, { qty: '100ml', name: 'Tomato sauce' }, { qty: '40g', name: 'Mozzarella' }, { qty: '60g', name: 'Onion' }, { qty: '2 cloves', name: 'Garlic' }], steps: ['Halve zucchini and scoop centers.', 'Brown beef with onion and garlic.', 'Add tomato sauce and fill zucchini.', 'Top with mozzarella.', 'Bake at 190C for 20 min.'] },
  { id: '48', icon: '🥘', name: 'Paella de Verduras', diet: 'Vegan', meal: 'Dinner', kcal: 410, carbs: 72, protein: 10, fat: 8, time: '40 min', goal: 'balanced', ingredients: [{ qty: '150g (dry)', name: 'Bomba rice' }, { qty: '150g', name: 'Bell peppers' }, { qty: '100g', name: 'Artichokes' }, { qty: '150g', name: 'Tomatoes' }, { qty: '0.5g', name: 'Saffron' }, { qty: '1 tsp', name: 'Smoked paprika' }, { qty: '400ml', name: 'Vegetable broth' }], steps: ['Fry peppers and tomatoes in wide pan.', 'Add rice and spices, stir.', 'Pour broth over and simmer until absorbed (no stirring).', 'Let rest 5 min before serving.'] },
  { id: '49', icon: '🥗', name: 'Spinach Lentil Salad', diet: 'Vegan', meal: 'Lunch', kcal: 340, carbs: 44, protein: 18, fat: 10, time: '20 min', goal: 'balanced', ingredients: [{ qty: '100g (dry)', name: 'Green lentils' }, { qty: '80g', name: 'Spinach' }, { qty: '40g', name: 'Red onion' }, { qty: '80g', name: 'Cherry tomatoes' }, { qty: '1 piece', name: 'Lemon' }, { qty: '2 tbsp (30ml)', name: 'Olive oil' }, { qty: '½ tsp', name: 'Cumin' }], steps: ['Cook lentils until tender.', 'Cool slightly.', 'Toss with spinach, tomatoes, red onion.', 'Dress with lemon, olive oil, cumin.'] },
  { id: '50', icon: '🍣', name: 'Sushi Bowl', diet: 'High Protein', meal: 'Dinner', kcal: 470, carbs: 58, protein: 34, fat: 10, time: '20 min', goal: 'balanced', ingredients: [{ qty: '100g (dry)', name: 'Sushi rice' }, { qty: '150g', name: 'Salmon' }, { qty: '½ medium (75g)', name: 'Avocado' }, { qty: '80g', name: 'Cucumber' }, { qty: '2 tbsp (30ml)', name: 'Soy sauce' }, { qty: '1 tbsp (15ml)', name: 'Rice vinegar' }, { qty: '1 tsp', name: 'Sesame seeds' }, { qty: '1 sheet', name: 'Nori' }], steps: ['Cook sushi rice with rice vinegar.', 'Slice salmon.', 'Assemble bowl with rice, salmon, avocado, cucumber.', 'Drizzle soy sauce and add sesame seeds.', 'Shred nori on top.'] },
  { id: '51', icon: '🫛', name: 'Edamame & Brown Rice', diet: 'Vegan', meal: 'Lunch', kcal: 330, carbs: 54, protein: 14, fat: 6, time: '20 min', goal: 'balanced', ingredients: [{ qty: '100g (dry)', name: 'Brown rice' }, { qty: '100g', name: 'Edamame' }, { qty: '2 tbsp (30ml)', name: 'Soy sauce' }, { qty: '1 tsp (5ml)', name: 'Sesame oil' }, { qty: '10g', name: 'Green onion' }, { qty: '1 tsp (5g)', name: 'Ginger' }], steps: ['Cook brown rice.', 'Steam edamame.', 'Mix rice with soy sauce, sesame oil, ginger.', 'Top with edamame and green onion.'] },
  { id: '52', icon: '🍔', name: 'Turkey Burger (No Bun)', diet: 'Low Carb', meal: 'Dinner', kcal: 380, carbs: 8, protein: 44, fat: 18, time: '20 min', goal: 'weight_loss', ingredients: [{ qty: '200g', name: 'Ground turkey' }, { qty: '2 leaves', name: 'Lettuce wrap' }, { qty: '1 medium (120g)', name: 'Tomato' }, { qty: '40g', name: 'Onion' }, { qty: '1 tsp', name: 'Mustard' }, { qty: '½ medium (75g)', name: 'Avocado' }], steps: ['Season turkey and form into patty.', 'Cook in pan 5 min each side.', 'Serve in lettuce wrap with toppings.'] },
  { id: '53', icon: '🥦', name: 'Broccoli Cheddar Frittata', diet: 'Keto', meal: 'Breakfast', kcal: 300, carbs: 4, protein: 24, fat: 22, time: '20 min', goal: 'weight_loss', ingredients: [{ qty: '3 pieces', name: 'Eggs' }, { qty: '150g', name: 'Broccoli florets' }, { qty: '40g', name: 'Cheddar cheese' }, { qty: '30ml', name: 'Cream' }, { qty: '60g', name: 'Onion' }, { qty: '¼ tsp', name: 'Salt' }, { qty: '¼ tsp', name: 'Pepper' }], steps: ['Blanch broccoli.', 'Saute onion, add broccoli.', 'Pour whisked eggs and cream over.', 'Top with cheddar.', 'Bake at 180C for 15 min.'] },
  { id: '54', icon: '🧆', name: 'Cauliflower Rice Bowl', diet: 'Keto', meal: 'Lunch', kcal: 290, carbs: 12, protein: 20, fat: 18, time: '15 min', goal: 'weight_loss', ingredients: [{ qty: '250g', name: 'Cauliflower' }, { qty: '150g', name: 'Ground beef' }, { qty: '60g', name: 'Onion' }, { qty: '2 cloves', name: 'Garlic' }, { qty: '2 tbsp (30ml)', name: 'Soy sauce' }, { qty: '1 tsp (5ml)', name: 'Sesame oil' }, { qty: '10g', name: 'Green onion' }], steps: ['Pulse cauliflower into rice-sized pieces.', 'Fry beef with onion and garlic.', 'Add cauliflower rice and stir fry.', 'Season with soy sauce and sesame oil.'] },
  { id: '55', icon: '🥝', name: 'Green Detox Smoothie', diet: 'Vegan', meal: 'Breakfast', kcal: 220, carbs: 42, protein: 6, fat: 4, time: '5 min', goal: 'weight_loss', ingredients: [{ qty: '60g', name: 'Spinach' }, { qty: '1 medium (80g)', name: 'Kiwi' }, { qty: '1 medium (180g)', name: 'Apple' }, { qty: '80g', name: 'Cucumber' }, { qty: '½ piece (30ml)', name: 'Lemon juice' }, { qty: '1 tsp (5g)', name: 'Ginger' }, { qty: '200ml', name: 'Water' }], steps: ['Add all ingredients to blender.', 'Blend until smooth.', 'Add more water for desired consistency.', 'Serve immediately.'] },
  { id: '56', icon: '🍠', name: 'Sweet Potato Hash', diet: 'Vegetarian', meal: 'Breakfast', kcal: 330, carbs: 50, protein: 10, fat: 10, time: '20 min', goal: 'balanced', ingredients: [{ qty: '1 large (300g)', name: 'Sweet potato' }, { qty: '2 pieces', name: 'Eggs' }, { qty: '80g', name: 'Bell pepper' }, { qty: '60g', name: 'Onion' }, { qty: '1 tsp', name: 'Smoked paprika' }, { qty: '1 tbsp (15ml)', name: 'Olive oil' }], steps: ['Dice and cook sweet potato until tender.', 'Add onion and peppers.', 'Make wells and add eggs.', 'Cover and cook until eggs set.'] },
  { id: '57', icon: '🍤', name: 'Garlic Butter Shrimp', diet: 'High Protein', meal: 'Dinner', kcal: 320, carbs: 4, protein: 42, fat: 14, time: '15 min', goal: 'weight_loss', ingredients: [{ qty: '200g', name: 'Shrimp' }, { qty: '1 tbsp (14g)', name: 'Butter' }, { qty: '3 cloves', name: 'Garlic' }, { qty: '½ piece (30ml)', name: 'Lemon juice' }, { qty: '10g', name: 'Parsley' }, { qty: '¼ tsp', name: 'Red pepper flakes' }], steps: ['Melt butter in pan over high heat.', 'Add garlic and pepper flakes.', 'Add shrimp and cook 1-2 min per side.', 'Squeeze lemon and add parsley.'] },
  { id: '58', icon: '🫕', name: 'Veggie Soup', diet: 'Vegan', meal: 'Lunch', kcal: 180, carbs: 30, protein: 6, fat: 4, time: '30 min', goal: 'weight_loss', ingredients: [{ qty: '500ml', name: 'Vegetable broth' }, { qty: '100g', name: 'Carrots' }, { qty: '80g', name: 'Celery' }, { qty: '100g', name: 'Zucchini' }, { qty: '100g', name: 'Tomatoes' }, { qty: '1 medium (100g)', name: 'Onion' }, { qty: '1 tsp', name: 'Thyme' }, { qty: '1 piece', name: 'Bay leaf' }], steps: ['Saute onion, carrots, celery.', 'Add broth, tomatoes, zucchini.', 'Add thyme and bay leaf.', 'Simmer 20 min.'] },
  { id: '59', icon: '🥗', name: 'Watermelon Feta Salad', diet: 'Vegetarian', meal: 'Snack', kcal: 180, carbs: 22, protein: 6, fat: 8, time: '5 min', goal: 'balanced', ingredients: [{ qty: '300g', name: 'Watermelon' }, { qty: '50g', name: 'Feta cheese' }, { qty: '5g', name: 'Fresh mint' }, { qty: '30g', name: 'Red onion' }, { qty: '½ piece', name: 'Lime' }, { qty: '¼ tsp', name: 'Black pepper' }], steps: ['Cube watermelon.', 'Crumble feta over top.', 'Add thinly sliced red onion.', 'Squeeze lime and add mint leaves.'] },
  { id: '60', icon: '🥙', name: 'Mediterranean Plate', diet: 'Mediterranean', meal: 'Lunch', kcal: 450, carbs: 38, protein: 18, fat: 24, time: '10 min', goal: 'balanced', ingredients: [{ qty: '1 piece (75g)', name: 'Pita bread' }, { qty: '4 tbsp (80g)', name: 'Hummus' }, { qty: '80g', name: 'Tabbouleh' }, { qty: '30g', name: 'Olives' }, { qty: '3 pieces', name: 'Dolmades' }, { qty: '80g', name: 'Cucumber' }, { qty: '40g', name: 'Feta' }], steps: ['Warm pita bread.', 'Arrange hummus, tabbouleh, olives, and dolmades.', 'Add cucumber and feta.', 'Serve immediately.'] },
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

// ── Meal Plan Modal ───────────────────────────────────────────────────────────
const DIET_PREFS = ['None', 'Vegan', 'Vegetarian', 'Keto', 'Low Carb', 'Mediterranean', 'High Protein'];
const ALLERGY_OPTIONS = ['Gluten', 'Dairy', 'Nuts', 'Eggs', 'Shellfish', 'Soy'];
const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface MealPlanDay {
  day: string;
  meals: { breakfast: MealEntry; lunch: MealEntry; dinner: MealEntry; snack: MealEntry };
  totalKcal: number;
}
interface MealEntry { name: string; kcal: number; icon: string; description: string }

function MealPlanModal({ visible, onClose, calorieGoal, weightGoal, recentFoods, email }: {
  visible: boolean;
  onClose: () => void;
  calorieGoal: number;
  weightGoal: string;
  recentFoods: string[];
  email: string | null;
}) {
  const [dietPref, setDietPref] = useState('None');
  const [allergies, setAllergies] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [plan, setPlan] = useState<{ days: MealPlanDay[]; tips: string[] } | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);

  function toggleAllergy(a: string) {
    setAllergies(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  }

  async function handleGenerate() {
    setGenerating(true);
    setPlan(null);
    try {
      const result = await generateMealPlan({
        calorieGoal, weightGoal, email: email ?? undefined,
        dietPreference: dietPref !== 'None' ? dietPref : undefined,
        allergies: allergies.length > 0 ? allergies : undefined,
        days: 7,
        recentFoods: recentFoods.slice(0, 20),
      });
      if (result?.days?.length > 0) {
        setPlan(result);
        setSelectedDay(0);
      } else {
        Alert.alert('Generation failed', 'Could not create a meal plan. Try again.');
      }
    } catch (err: any) {
      if (err?.message === 'SETUP_REQUIRED') {
        Alert.alert('Not set up', 'Meal planning requires a deployed server. Set EXPO_PUBLIC_API_URL in .env.');
      } else if (err?.message?.includes('limit')) {
        Alert.alert('Rate limited', 'Please wait 5 minutes before generating a new plan.');
      } else {
        Alert.alert('Generation failed', err?.message ?? 'Please try again.');
      }
    } finally { setGenerating(false); }
  }

  const day = plan?.days[selectedDay];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={{ padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <TouchableOpacity onPress={onClose} style={{ width: spacing.xl, height: spacing.xl, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.layer2, borderRadius: radius.pill }}>
            <Ionicons name="close" size={fontSize.base} color={colors.ink2} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: colors.ink, fontSize: fontSize.md, fontWeight: '700' }}>AI Meal Planner</Text>
            <Text style={{ color: colors.ink3, fontSize: fontSize.xs }}>{calorieGoal} kcal goal</Text>
          </View>
          <View style={{ width: spacing.xl }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl }} showsVerticalScrollIndicator={false}>
          {!plan ? (
            <>
              {/* Diet preference */}
              <View style={{ gap: spacing.xs }}>
                <Text style={{ color: colors.ink3, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Diet Preference</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
                  {DIET_PREFS.map(d => (
                    <TouchableOpacity key={d} onPress={() => setDietPref(d)}
                      style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1.5,
                        borderColor: dietPref === d ? colors.purple : colors.line2,
                        backgroundColor: dietPref === d ? colors.purpleTint : colors.layer2 }}>
                      <Text style={{ color: dietPref === d ? colors.lavender : colors.ink2, fontSize: fontSize.sm, fontWeight: '600' }}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Allergies */}
              <View style={{ gap: spacing.xs }}>
                <Text style={{ color: colors.ink3, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>Avoid / Allergies</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  {ALLERGY_OPTIONS.map(a => (
                    <TouchableOpacity key={a} onPress={() => toggleAllergy(a)}
                      style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1.5,
                        borderColor: allergies.includes(a) ? colors.rose : colors.line2,
                        backgroundColor: allergies.includes(a) ? colors.rose + '18' : colors.layer2 }}>
                      <Text style={{ color: allergies.includes(a) ? colors.rose : colors.ink2, fontSize: fontSize.sm, fontWeight: '600' }}>{a}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Goal context */}
              <View style={{ backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, padding: spacing.md, gap: spacing.xs }}>
                <Text style={{ color: colors.ink3, fontSize: fontSize.xs }}>Using your profile:</Text>
                <Text style={{ color: colors.ink2, fontSize: fontSize.sm }}>🎯 {calorieGoal} kcal/day · {weightGoal || 'maintain'}</Text>
                {recentFoods.length > 0 && <Text style={{ color: colors.ink3, fontSize: fontSize.xs }}>Based on {recentFoods.length} recent foods</Text>}
              </View>

              <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
                <LinearGradient colors={generating ? [colors.line2, colors.line2] : [colors.purple, colors.purpleGlow]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ paddingVertical: spacing.md, alignItems: 'center', gap: spacing.xs }}>
                  <TouchableOpacity onPress={handleGenerate} disabled={generating} style={{ width: '100%', alignItems: 'center', gap: spacing.xs }}>
                    {generating ? (
                      <>
                        <ActivityIndicator size="small" color={colors.ink} />
                        <Text style={{ color: colors.ink2, fontSize: fontSize.sm }}>Creating your 7-day plan…</Text>
                      </>
                    ) : (
                      <Text style={{ color: colors.ink, fontSize: fontSize.base, fontWeight: '800', letterSpacing: 0.5 }}>GENERATE 7-DAY PLAN</Text>
                    )}
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            </>
          ) : (
            <>
              {/* Day tabs */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
                {plan.days.map((d, i) => (
                  <TouchableOpacity key={i} onPress={() => setSelectedDay(i)}
                    style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1.5,
                      borderColor: selectedDay === i ? colors.purple : colors.line2,
                      backgroundColor: selectedDay === i ? colors.purpleTint : colors.layer2 }}>
                    <Text style={{ color: selectedDay === i ? colors.lavender : colors.ink2, fontSize: fontSize.xs, fontWeight: '700' }}>{(d.day ?? WEEK_DAYS[i]).slice(0, 3).toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Day header */}
              {day && (
                <View style={{ backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line2, padding: spacing.md, gap: spacing.md }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: colors.ink, fontSize: fontSize.md, fontWeight: '700' }}>{day.day ?? WEEK_DAYS[selectedDay]}</Text>
                    <View style={{ backgroundColor: colors.purpleTint, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                      <Text style={{ color: colors.lavender, fontSize: fontSize.sm, fontWeight: '700' }}>{day.totalKcal ?? 0} kcal</Text>
                    </View>
                  </View>
                  {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(mealKey => {
                    const m = day.meals?.[mealKey];
                    if (!m) return null;
                    return (
                      <View key={mealKey} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line }}>
                        <Text style={{ fontSize: fontSize.lg }}>{m.icon ?? '🍽️'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.ink3, fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>{mealKey}</Text>
                          <Text style={{ color: colors.ink, fontSize: fontSize.sm, fontWeight: '600' }}>{m.name}</Text>
                          {m.description ? <Text style={{ color: colors.ink3, fontSize: fontSize.xs }}>{m.description}</Text> : null}
                        </View>
                        <Text style={{ color: colors.lavender, fontSize: fontSize.sm, fontWeight: '700' }}>{m.kcal} kcal</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Tips */}
              {plan.tips?.length > 0 && (
                <View style={{ backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, padding: spacing.md, gap: spacing.sm }}>
                  <Text style={{ color: colors.ink3, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' }}>AI Tips</Text>
                  {plan.tips.slice(0, 3).map((tip, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <Text style={{ color: colors.purple, fontSize: fontSize.sm }}>✦</Text>
                      <Text style={{ flex: 1, color: colors.ink2, fontSize: fontSize.sm }}>{tip}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Regenerate */}
              <TouchableOpacity onPress={() => setPlan(null)}
                style={{ borderWidth: 1, borderColor: colors.line2, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' }}>
                <Text style={{ color: colors.ink2, fontSize: fontSize.sm, fontWeight: '600' }}>← New Plan</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function RecipeCard({ recipe, onPress }: { recipe: typeof RECIPES[0]; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.recipeCard} onPress={onPress} activeOpacity={0.8}>
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
  const { entries, selectedDate, addFood } = useDiaryStore();
  const { setMessagesOpen, addXp, calorieGoal, hasUnread, checkAndUpdateStreak } = useAppStore();
  const { email } = useAuthStore();
  const [recipeSearch, setRecipeSearch] = useState('');
  const [foodSearch, setFoodSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [selected, setSelected] = useState<typeof RECIPES[0] | null>(null);
  const [planVisible, setPlanVisible] = useState(false);
  const [viewMode, setViewMode] = useState<'recipes' | 'foods'>('recipes');
  const [foodFilter, setFoodFilter] = useState('All');
  const [selectedFood, setSelectedFood] = useState<LocalFood | null>(null);

  const entry = entries[selectedDate];
  const totalKcal = (entry?.foods ?? []).reduce((s, f) => s + f.kcal, 0);
  const remaining = Math.max(0, calorieGoal - totalKcal);

  // Collect unique food names from recent diary entries for AI context
  const recentFoods = (() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const e of Object.values(entries)) {
      for (const f of (e?.foods ?? [])) {
        if (!seen.has(f.name)) { seen.add(f.name); result.push(f.name); }
        if (result.length >= 30) return result;
      }
    }
    return result;
  })();

  const filtered = RECIPES.filter((r) => {
    const matchSearch = r.name.toLowerCase().includes(recipeSearch.toLowerCase());
    if (!matchSearch) return false;
    if (filter === 'All') return true;
    if (['Breakfast', 'Lunch', 'Dinner', 'Snack'].includes(filter)) return r.meal === filter;
    return r.diet === filter;
  });

  // Goal-based section: recipes that fit remaining kcal budget
  const forGoal = RECIPES.filter(r => r.kcal <= remaining && remaining > 0).slice(0, 4);

  const filteredFoods = FOOD_DATABASE.filter(f => {
    if (foodSearch) return f.name.toLowerCase().includes(foodSearch.toLowerCase()); // global search ignores category
    if (foodFilter === 'All') return true;
    return getFoodCategory(f) === foodFilter;
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Header */}
        <View style={styles.appHeader}>
          <Text style={styles.heading}>Recipes</Text>
          <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
            <TouchableOpacity onPress={() => setPlanVisible(true)}
              style={{ borderRadius: radius.md, overflow: 'hidden' }}>
              <LinearGradient colors={[colors.purple, colors.purpleGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Text style={{ fontSize: fontSize.sm }}>✨</Text>
                <Text style={{ color: colors.ink, fontSize: fontSize.xs, fontWeight: '800' }}>AI Plan</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.profileBtn} onPress={() => setMessagesOpen(true)}>
              <Ionicons name="notifications-outline" size={22} color={colors.ink2} />
              {hasUnread && <View style={styles.notifDot} />}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/(tabs)/profile')} style={styles.profileBtn}>
              <Ionicons name="person-outline" size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>
        </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Calorie budget banner */}
        {remaining > 0 && (
          <View style={styles.budgetBanner}>
            <View style={styles.budgetLeft}>
              <Text style={styles.budgetLabel}>CALORIE BUDGET</Text>
              <Text style={styles.budgetVal}><Text style={styles.budgetNum}>{remaining}</Text> kcal remaining</Text>
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
            <Text style={[styles.tabBtnTxt, viewMode === 'foods' && styles.tabBtnTxtActive]}>Foods</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={16} color={colors.ink3} style={styles.searchIcon} />
          <TextInput
            style={styles.search}
            placeholder={viewMode === 'recipes' ? 'Search recipes...' : 'Search foods...'}
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
            {/* For your goal section */}
            {filter === 'All' && !recipeSearch && forGoal.length > 0 && (
              <>
                <Text style={styles.sectionHdr}>For your goal</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md }}>
                  {forGoal.map((r) => (
                    <TouchableOpacity key={r.id} style={styles.goalCard} onPress={() => setSelected(r)} activeOpacity={0.8}>
                      <Text style={styles.goalIcon}>{r.icon}</Text>
                      <Text style={styles.goalCardName}>{r.name}</Text>
                      <Text style={styles.goalCardKcal}>{r.kcal} kcal</Text>
                      <Text style={[styles.goalCardFits, { color: colors.green }]}>✓ Fits budget</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Recipe grid */}
            <Text style={styles.sectionHdr}>{filter === 'All' && !recipeSearch ? 'All Recipes' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}</Text>
            <View style={styles.grid}>
              {filtered.map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} onPress={() => setSelected(recipe)} />
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
                  <Text style={styles.emptyTxt}>No foods found</Text>
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
                    <Text style={[styles.catCardCount, { color: meta.color }]}>{count} foods</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : (
          /* Category drill-down: food grid */
          <>
            <Text style={styles.sectionHdr}>{filteredFoods.length} foods · per 100g</Text>
            <View style={styles.grid}>
              {filteredFoods.map(food => (
                <FoodCard key={food.id} food={food} onPress={() => setSelectedFood(food)} />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* AI Meal Planner */}
      <MealPlanModal
        visible={planVisible}
        onClose={() => setPlanVisible(false)}
        calorieGoal={calorieGoal || 2000}
        weightGoal=""
        recentFoods={recentFoods}
        email={email}
      />

      {/* Food detail modal */}
      <Modal visible={!!selectedFood} animationType="slide" presentationStyle="pageSheet">
        {selectedFood && (
          <SafeAreaView style={styles.modal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setSelectedFood(null)} style={styles.closeBtn}>
                <Ionicons name="close" size={fontSize.base} color={colors.ink2} />
              </TouchableOpacity>
              <Text style={styles.modalMeal}>{getFoodCategory(selectedFood)}</Text>
              <TouchableOpacity onPress={async () => {
                await addFood(selectedDate, {
                  id: `${Date.now()}`, icon: selectedFood.icon, name: selectedFood.name,
                  kcal: selectedFood.kcal, carbs: selectedFood.carbs,
                  protein: selectedFood.protein, fat: selectedFood.fat,
                  unit: '100g', meal: 'snack',
                  fiber: selectedFood.fiber, sugar: selectedFood.sugar, sodium: selectedFood.sodium,
                });
                await checkAndUpdateStreak(selectedDate);
                await addXp(10);
                Alert.alert('Added to diary ✓', `${selectedFood.name} logged (100g). +10 XP`);
                setSelectedFood(null);
              }} style={styles.addBtn}>
                <Text style={styles.addBtnTxt}>+ Add</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.modalIcon}>{selectedFood.icon}</Text>
              <Text style={styles.modalTitle}>{selectedFood.name}</Text>
              <Text style={styles.modalTime}>Per 100g · USDA values</Text>

              <View style={styles.modalMacros}>
                {[
                  { label: 'Kcal',    value: selectedFood.kcal,              color: colors.lavender },
                  { label: 'Protein', value: `${selectedFood.protein}g`,     color: colors.rose },
                  { label: 'Carbs',   value: `${selectedFood.carbs}g`,       color: colors.sky },
                  { label: 'Fat',     value: `${selectedFood.fat}g`,         color: colors.violet },
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

              <TouchableOpacity style={styles.logBtn} onPress={async () => {
                await addFood(selectedDate, {
                  id: `${Date.now()}`, icon: selectedFood.icon, name: selectedFood.name,
                  kcal: selectedFood.kcal, carbs: selectedFood.carbs,
                  protein: selectedFood.protein, fat: selectedFood.fat,
                  unit: '100g', meal: 'snack',
                  fiber: selectedFood.fiber, sugar: selectedFood.sugar, sodium: selectedFood.sodium,
                });
                await checkAndUpdateStreak(selectedDate);
                await addXp(10);
                Alert.alert('Food logged ✓', `${selectedFood.name} added to your diary. +10 XP`);
                setSelectedFood(null);
              }}>
                <Text style={styles.logBtnTxt}>Log 100g to diary</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      {/* Recipe detail modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected && (
          <SafeAreaView style={styles.modal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setSelected(null)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={colors.ink2} />
              </TouchableOpacity>
              <Text style={styles.modalMeal}>{selected.meal}</Text>
              <TouchableOpacity onPress={async () => {
                const meal = selected.meal.toLowerCase() as 'breakfast' | 'lunch' | 'dinner' | 'snack';
                await addFood(selectedDate, { id: `${Date.now()}`, icon: selected.icon, name: selected.name, kcal: selected.kcal, carbs: selected.carbs, protein: selected.protein, fat: selected.fat, unit: 'serving', meal });
                await checkAndUpdateStreak(selectedDate);
                await addXp(10);
                Alert.alert('Added to diary ✓', `${selected.name} logged as ${meal}. +10 XP`);
                setSelected(null);
              }} style={styles.addBtn}>
                <Text style={styles.addBtnTxt}>+ Add</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.modalIcon}>{selected.icon}</Text>
              <Text style={styles.modalTitle}>{selected.name}</Text>
              <Text style={styles.modalTime}>⏱ {selected.time}</Text>

              {/* Macro pills */}
              <View style={styles.modalMacros}>
                {[
                  { label: 'Kcal',    value: selected.kcal,            color: colors.lavender },
                  { label: 'Carbs',   value: `${selected.carbs}g`,     color: colors.sky },
                  { label: 'Protein', value: `${selected.protein}g`,   color: colors.rose },
                  { label: 'Fat',     value: `${selected.fat}g`,       color: colors.violet },
                ].map(({ label, value, color }) => (
                  <View key={label} style={styles.modalMacroPill}>
                    <Text style={[styles.modalMacroVal, { color }]}>{value}</Text>
                    <Text style={styles.modalMacroLabel}>{label}</Text>
                  </View>
                ))}
              </View>

              {/* Fits budget indicator */}
              {selected.kcal <= remaining && remaining > 0 && (
                <View style={styles.fitsBadge}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.green} />
                  <Text style={styles.fitsTxt}>Fits your {remaining} kcal remaining budget</Text>
                </View>
              )}

              <Text style={styles.modalSection}>Ingredients</Text>
              {selected.ingredients.map((ing, i) => (
                <View key={i} style={styles.ingredientRow}>
                  <Text style={styles.ingredientQty}>{ing.qty}</Text>
                  <Text style={styles.ingredientTxt}>{ing.name}</Text>
                </View>
              ))}

              <Text style={styles.modalSection}>Instructions</Text>
              {selected.steps.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNum}><Text style={styles.stepNumTxt}>{i + 1}</Text></View>
                  <Text style={styles.stepTxt}>{step}</Text>
                </View>
              ))}

              <TouchableOpacity style={styles.logBtn} onPress={async () => {
                const meal = selected.meal.toLowerCase() as 'breakfast' | 'lunch' | 'dinner' | 'snack';
                await addFood(selectedDate, { id: `${Date.now()}`, icon: selected.icon, name: selected.name, kcal: selected.kcal, carbs: selected.carbs, protein: selected.protein, fat: selected.fat, unit: 'serving', meal });
                await checkAndUpdateStreak(selectedDate);
                await addXp(10);
                Alert.alert('Meal logged ✓', `${selected.name} added to your ${meal}. +10 XP`);
                setSelected(null);
              }}>
                <Text style={styles.logBtnTxt}>Log this meal</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, gap: spacing.md, paddingBottom: 24 },

  appHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  profileBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notifDot: { position: 'absolute', top: 8, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.rose },
  heading: { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink },

  // Budget banner
  budgetBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(74,222,128,0.08)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.2)', borderRadius: radius.lg, padding: spacing.md },
  budgetLeft: { gap: 3 },
  budgetLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(74,222,128,0.7)' },
  budgetVal: { fontSize: 13, color: colors.ink2 },
  budgetNum: { fontSize: 20, fontWeight: '800', color: colors.green },
  budgetRing: { alignItems: 'center' },
  budgetPct: { fontSize: 20, fontWeight: '800', color: colors.green },
  budgetPctLbl: { fontSize: 10, color: colors.ink3 },

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

  sectionHdr: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.ink3 },

  // Goal cards (horizontal)
  goalCard: { width: 130, backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 4, alignItems: 'center' },
  goalCardName: { fontSize: 12, fontWeight: '600', color: colors.ink, textAlign: 'center' },
  goalCardKcal: { fontSize: 13, fontWeight: '700', color: colors.lavender },
  goalCardFits: { fontSize: 10, fontWeight: '600' },

  // Recipe grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  recipeCard: { width: '47%', backgroundColor: colors.layer1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.xs },
  recipeIcon: { fontSize: 36, textAlign: 'center', marginBottom: spacing.xs },
  dietBadge: { alignSelf: 'flex-start', backgroundColor: colors.purple + '22', borderRadius: radius.xl, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  dietBadgeText: { color: colors.lavender, fontSize: fontSize.xs },
  recipeName: { color: colors.ink, fontSize: fontSize.sm, fontWeight: '600' },
  recipeMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recipeMeta: { color: colors.ink3, fontSize: fontSize.xs },
  recipeKcal: { color: colors.lavender, fontSize: fontSize.sm, fontWeight: '700' },
  recipeMacroRow: { flexDirection: 'row', gap: spacing.xs },
  recipeMacroTxt: { fontSize: fontSize.xs, fontWeight: '600', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  recipeMacroP:   { color: colors.sky,   backgroundColor: colors.sky   + '22', borderWidth: 1, borderColor: colors.sky   + '55' },
  recipeMacroC:   { color: colors.honey, backgroundColor: colors.honey + '22', borderWidth: 1, borderColor: colors.honey + '55' },
  recipeMacroF:   { color: colors.rose,  backgroundColor: colors.rose  + '22', borderWidth: 1, borderColor: colors.rose  + '55' },

  // Modal
  modal: { flex: 1, backgroundColor: colors.bg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.layer2, alignItems: 'center', justifyContent: 'center' },
  modalMeal: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: colors.ink3 },
  addBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: colors.purple, borderRadius: radius.md },
  addBtnTxt: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },
  modalScroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 50 },
  modalIcon: { fontSize: 64, textAlign: 'center', marginBottom: spacing.sm },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  modalTime: { fontSize: 13, color: colors.ink3, textAlign: 'center' },
  modalMacros: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: spacing.md, backgroundColor: colors.layer1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  modalMacroPill: { alignItems: 'center', gap: 4 },
  modalMacroVal: { fontSize: fontSize.md, fontWeight: '700' },
  modalMacroLabel: { color: colors.ink3, fontSize: fontSize.xs },
  fitsBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.green + '11', borderWidth: 1, borderColor: colors.green + '44', borderRadius: radius.md, padding: spacing.sm },
  fitsTxt: { fontSize: 13, color: colors.green, fontWeight: '500' },
  modalSection: { color: colors.ink, fontSize: fontSize.base, fontWeight: '700', marginTop: spacing.md },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  ingredientQty: { width: 110, fontSize: fontSize.sm, fontWeight: '700', color: colors.lavender },
  ingredientTxt: { flex: 1, color: colors.ink2, fontSize: fontSize.sm },
  stepRow: { flexDirection: 'row', gap: 12, paddingVertical: 4 },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.purple + '33', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  stepNumTxt: { fontSize: 12, fontWeight: '700', color: colors.lavender },
  stepTxt: { flex: 1, color: colors.ink2, fontSize: fontSize.sm, lineHeight: 20 },
  logBtn: { backgroundColor: colors.purple, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.md },
  logBtnTxt: { color: colors.white, fontWeight: '700', fontSize: fontSize.base },

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

  // Goal icon (token instead of hardcoded)
  goalIcon: { fontSize: fontSize['2xl'], textAlign: 'center' },

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
});

import { useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  Modal, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDiaryStore } from '../../src/store/diaryStore';
import { colors, spacing, fontSize, radius } from '../../src/theme';
import { useAppStore } from '../../src/store/appStore';

const DIET_FILTERS = ['All', 'Breakfast', 'Lunch', 'Dinner', 'Snack', 'High Protein', 'Low Carb', 'Vegan', 'Keto', 'Vegetarian', 'Mediterranean'];

const RECIPES = [
  { id: '1',  icon: '🥗',  name: 'Greek Salad',          diet: 'Vegan',       meal: 'Lunch',     kcal: 220, carbs: 18, protein: 6,  fat: 14, time: '10 min', goal: 'weight_loss',   ingredients: ['Cucumber', 'Tomato', 'Olives', 'Feta', 'Red onion', 'Olive oil'], steps: ['Chop all vegetables.', 'Combine in a bowl.', 'Add feta and olives.', 'Drizzle with olive oil and season.'] },
  { id: '2',  icon: '🍗',  name: 'Grilled Chicken',       diet: 'High Protein', meal: 'Dinner',   kcal: 320, carbs: 2,  protein: 52, fat: 10, time: '25 min', goal: 'muscle_gain',   ingredients: ['Chicken breast', 'Olive oil', 'Garlic', 'Lemon', 'Rosemary'], steps: ['Marinate chicken with olive oil, garlic, and lemon.', 'Grill for 12 min each side.', 'Rest 5 min before serving.'] },
  { id: '3',  icon: '🥑',  name: 'Avocado Toast',         diet: 'Vegetarian',  meal: 'Breakfast', kcal: 290, carbs: 28, protein: 8,  fat: 17, time: '8 min',  goal: 'balanced',      ingredients: ['Sourdough bread', 'Avocado', 'Lemon juice', 'Red pepper flakes', 'Salt'], steps: ['Toast bread until golden.', 'Mash avocado with lemon juice and salt.', 'Spread on toast, top with pepper flakes.'] },
  { id: '4',  icon: '🐟',  name: 'Salmon Bowl',           diet: 'High Protein', meal: 'Lunch',    kcal: 450, carbs: 32, protein: 44, fat: 16, time: '20 min', goal: 'muscle_gain',   ingredients: ['Salmon fillet', 'Brown rice', 'Edamame', 'Soy sauce', 'Sesame seeds', 'Cucumber'], steps: ['Cook rice.', 'Pan-sear salmon 4 min each side.', 'Assemble bowl with all ingredients.', 'Drizzle soy sauce and sprinkle sesame seeds.'] },
  { id: '5',  icon: '🥚',  name: 'Egg White Omelette',    diet: 'Keto',        meal: 'Breakfast', kcal: 180, carbs: 3,  protein: 28, fat: 6,  time: '10 min', goal: 'weight_loss',   ingredients: ['Egg whites', 'Spinach', 'Bell pepper', 'Salt', 'Pepper'], steps: ['Whisk egg whites with salt.', 'Sauté vegetables 2 min.', 'Pour egg whites over vegetables.', 'Cook until set and fold.'] },
  { id: '6',  icon: '🍲',  name: 'Lentil Soup',           diet: 'Vegan',       meal: 'Dinner',    kcal: 280, carbs: 42, protein: 16, fat: 4,  time: '35 min', goal: 'balanced',      ingredients: ['Red lentils', 'Onion', 'Carrots', 'Cumin', 'Vegetable stock', 'Lemon'], steps: ['Sauté onion and carrots.', 'Add lentils, cumin, and stock.', 'Simmer 25 min.', 'Blend partially and squeeze lemon.'] },
  { id: '7',  icon: '🥣',  name: 'Overnight Oats',        diet: 'Vegetarian',  meal: 'Breakfast', kcal: 350, carbs: 55, protein: 12, fat: 8,  time: '5 min',  goal: 'balanced',      ingredients: ['Rolled oats', 'Almond milk', 'Chia seeds', 'Banana', 'Honey'], steps: ['Mix oats, milk and chia seeds.', 'Refrigerate overnight.', 'Top with banana and honey before serving.'] },
  { id: '8',  icon: '🌮',  name: 'Chicken Tacos',         diet: 'High Protein', meal: 'Dinner',   kcal: 420, carbs: 38, protein: 36, fat: 12, time: '20 min', goal: 'muscle_gain',   ingredients: ['Chicken thighs', 'Corn tortillas', 'Lime', 'Cilantro', 'Salsa', 'Avocado'], steps: ['Season and grill chicken.', 'Slice into strips.', 'Warm tortillas and assemble tacos.', 'Top with salsa, avocado, and lime.'] },
  { id: '9',  icon: '🥜',  name: 'Peanut Butter Smoothie', diet: 'High Protein', meal: 'Breakfast', kcal: 380, carbs: 30, protein: 22, fat: 18, time: '5 min', goal: 'muscle_gain', ingredients: ['Banana', 'Peanut butter', 'Protein powder', 'Oat milk', 'Honey'], steps: ['Add all ingredients to blender.', 'Blend until smooth.', 'Serve immediately.'] },
  { id: '10', icon: '🫘',  name: 'Black Bean Bowl',        diet: 'Vegan',       meal: 'Lunch',     kcal: 310, carbs: 48, protein: 14, fat: 6,  time: '15 min', goal: 'weight_loss',   ingredients: ['Black beans', 'Brown rice', 'Corn', 'Bell peppers', 'Cumin', 'Lime'], steps: ['Warm beans with cumin.', 'Cook rice.', 'Assemble bowl with all ingredients.', 'Squeeze lime over the top.'] },
  // Breakfast
  { id: '11', icon: '🥞', name: 'Protein Pancakes', diet: 'High Protein', meal: 'Breakfast', kcal: 340, carbs: 38, protein: 28, fat: 8, time: '15 min', goal: 'muscle_gain', ingredients: ['Oat flour', 'Eggs', 'Banana', 'Protein powder', 'Baking powder', 'Almond milk'], steps: ['Mash banana and mix with eggs.', 'Add oat flour, protein powder, and baking powder.', 'Add milk to desired consistency.', 'Cook in non-stick pan, 2 min per side.'] },
  { id: '12', icon: '🍳', name: 'Scrambled Eggs', diet: 'Keto', meal: 'Breakfast', kcal: 220, carbs: 2, protein: 16, fat: 16, time: '8 min', goal: 'weight_loss', ingredients: ['Eggs', 'Butter', 'Salt', 'Pepper', 'Chives'], steps: ['Whisk eggs with salt and pepper.', 'Melt butter in pan over low heat.', 'Add eggs and fold gently.', 'Remove from heat when just set.'] },
  { id: '13', icon: '🫐', name: 'Berry Smoothie Bowl', diet: 'Vegan', meal: 'Breakfast', kcal: 310, carbs: 58, protein: 8, fat: 5, time: '5 min', goal: 'weight_loss', ingredients: ['Frozen mixed berries', 'Banana', 'Oat milk', 'Granola', 'Chia seeds', 'Honey'], steps: ['Blend frozen berries and banana with minimal milk.', 'Pour into bowl.', 'Top with granola, chia seeds, and honey.'] },
  { id: '14', icon: '🥐', name: 'Greek Yogurt Parfait', diet: 'Vegetarian', meal: 'Breakfast', kcal: 280, carbs: 35, protein: 18, fat: 7, time: '5 min', goal: 'balanced', ingredients: ['Greek yogurt', 'Granola', 'Mixed berries', 'Honey', 'Almonds'], steps: ['Layer yogurt in a glass.', 'Add granola and berries.', 'Drizzle with honey and top with almonds.'] },
  { id: '15', icon: '🍵', name: 'Matcha Oatmeal', diet: 'Vegan', meal: 'Breakfast', kcal: 295, carbs: 52, protein: 9, fat: 6, time: '10 min', goal: 'balanced', ingredients: ['Rolled oats', 'Matcha powder', 'Almond milk', 'Maple syrup', 'Hemp seeds', 'Banana'], steps: ['Cook oats with almond milk.', 'Stir in matcha powder and maple syrup.', 'Top with hemp seeds and sliced banana.'] },
  { id: '16', icon: '🥚', name: 'Veggie Frittata', diet: 'Vegetarian', meal: 'Breakfast', kcal: 260, carbs: 8, protein: 20, fat: 16, time: '20 min', goal: 'weight_loss', ingredients: ['Eggs', 'Zucchini', 'Bell pepper', 'Onion', 'Feta cheese', 'Olive oil'], steps: ['Saute vegetables in oven-safe pan.', 'Whisk eggs and pour over vegetables.', 'Add crumbled feta.', 'Bake at 180C for 12 min until set.'] },
  // Lunch
  { id: '17', icon: '🌯', name: 'Turkey Wrap', diet: 'High Protein', meal: 'Lunch', kcal: 380, carbs: 32, protein: 34, fat: 12, time: '10 min', goal: 'muscle_gain', ingredients: ['Whole wheat tortilla', 'Turkey slices', 'Avocado', 'Lettuce', 'Tomato', 'Mustard'], steps: ['Lay tortilla flat.', 'Layer turkey, avocado, lettuce, tomato.', 'Drizzle mustard.', 'Roll tightly and slice.'] },
  { id: '18', icon: '🥙', name: 'Falafel Pita', diet: 'Vegan', meal: 'Lunch', kcal: 420, carbs: 56, protein: 14, fat: 16, time: '20 min', goal: 'balanced', ingredients: ['Falafel balls', 'Pita bread', 'Hummus', 'Cucumber', 'Tomato', 'Tahini'], steps: ['Warm falafel in oven 10 min.', 'Open pita and spread hummus.', 'Add falafel and vegetables.', 'Drizzle with tahini.'] },
  { id: '19', icon: '🍱', name: 'Tuna Nicoise', diet: 'High Protein', meal: 'Lunch', kcal: 390, carbs: 22, protein: 38, fat: 16, time: '15 min', goal: 'weight_loss', ingredients: ['Canned tuna', 'Green beans', 'Cherry tomatoes', 'Boiled egg', 'Olives', 'Dijon dressing'], steps: ['Blanch green beans 3 min.', 'Arrange all ingredients on plate.', 'Drizzle with Dijon vinaigrette.'] },
  { id: '20', icon: '🫙', name: 'Mason Jar Salad', diet: 'Vegetarian', meal: 'Lunch', kcal: 340, carbs: 28, protein: 14, fat: 20, time: '10 min', goal: 'weight_loss', ingredients: ['Mixed greens', 'Cherry tomatoes', 'Cucumber', 'Chickpeas', 'Feta', 'Balsamic dressing'], steps: ['Layer dressing at bottom.', 'Add chickpeas and tomatoes.', 'Add cucumber and greens on top.', 'Seal and refrigerate until ready.'] },
  { id: '21', icon: '🍜', name: 'Miso Soup Ramen', diet: 'Vegetarian', meal: 'Lunch', kcal: 360, carbs: 50, protein: 16, fat: 8, time: '20 min', goal: 'balanced', ingredients: ['Ramen noodles', 'Miso paste', 'Tofu', 'Bok choy', 'Green onion', 'Sesame oil'], steps: ['Boil noodles per package.', 'Dissolve miso in hot water.', 'Add cubed tofu and bok choy.', 'Top with green onion and sesame oil.'] },
  { id: '22', icon: '🥗', name: 'Quinoa Power Bowl', diet: 'Vegan', meal: 'Lunch', kcal: 400, carbs: 52, protein: 16, fat: 14, time: '25 min', goal: 'balanced', ingredients: ['Quinoa', 'Roasted sweet potato', 'Spinach', 'Pumpkin seeds', 'Lemon tahini dressing', 'Avocado'], steps: ['Cook quinoa.', 'Roast sweet potato cubes at 200C.', 'Assemble bowl and drizzle tahini dressing.'] },
  { id: '23', icon: '🍗', name: 'Caesar Salad with Chicken', diet: 'High Protein', meal: 'Lunch', kcal: 430, carbs: 12, protein: 46, fat: 22, time: '20 min', goal: 'muscle_gain', ingredients: ['Romaine lettuce', 'Grilled chicken', 'Parmesan', 'Croutons', 'Caesar dressing', 'Lemon'], steps: ['Grill chicken and slice.', 'Tear lettuce and toss with dressing.', 'Add chicken and croutons.', 'Top with parmesan and lemon.'] },
  { id: '24', icon: '🫔', name: 'Veggie Burrito Bowl', diet: 'Vegan', meal: 'Lunch', kcal: 370, carbs: 60, protein: 12, fat: 8, time: '15 min', goal: 'balanced', ingredients: ['Brown rice', 'Black beans', 'Corn', 'Salsa', 'Guacamole', 'Lime'], steps: ['Cook rice.', 'Warm beans with cumin.', 'Assemble bowl with all toppings.', 'Squeeze lime and add salsa.'] },
  // Dinner
  { id: '25', icon: '🥩', name: 'Beef Stir Fry', diet: 'High Protein', meal: 'Dinner', kcal: 480, carbs: 28, protein: 44, fat: 20, time: '20 min', goal: 'muscle_gain', ingredients: ['Beef strips', 'Broccoli', 'Bell pepper', 'Soy sauce', 'Ginger', 'Garlic', 'Rice'], steps: ['Cook rice.', 'Stir fry beef in hot wok until brown.', 'Add vegetables and stir fry 3 min.', 'Add soy sauce, ginger, garlic.', 'Serve over rice.'] },
  { id: '26', icon: '🐠', name: 'Baked Cod', diet: 'High Protein', meal: 'Dinner', kcal: 310, carbs: 8, protein: 46, fat: 10, time: '25 min', goal: 'weight_loss', ingredients: ['Cod fillet', 'Lemon', 'Capers', 'Olive oil', 'Garlic', 'Parsley'], steps: ['Preheat oven to 200C.', 'Place cod in baking dish with olive oil and lemon.', 'Top with capers and garlic.', 'Bake 18 min.', 'Garnish with parsley.'] },
  { id: '27', icon: '🍲', name: 'Chickpea Curry', diet: 'Vegan', meal: 'Dinner', kcal: 380, carbs: 54, protein: 14, fat: 10, time: '30 min', goal: 'balanced', ingredients: ['Chickpeas', 'Coconut milk', 'Tomatoes', 'Curry powder', 'Onion', 'Garlic', 'Basmati rice'], steps: ['Saute onion, garlic with curry powder.', 'Add tomatoes and chickpeas.', 'Pour in coconut milk and simmer 20 min.', 'Serve over rice.'] },
  { id: '28', icon: '🫕', name: 'Turkey Meatballs', diet: 'High Protein', meal: 'Dinner', kcal: 420, carbs: 30, protein: 48, fat: 12, time: '35 min', goal: 'muscle_gain', ingredients: ['Ground turkey', 'Breadcrumbs', 'Egg', 'Parmesan', 'Marinara sauce', 'Spaghetti'], steps: ['Mix turkey with breadcrumbs, egg, parmesan.', 'Form into balls.', 'Bake at 190C for 20 min.', 'Simmer in marinara sauce.', 'Serve over pasta.'] },
  { id: '29', icon: '🥬', name: 'Stuffed Bell Peppers', diet: 'Vegetarian', meal: 'Dinner', kcal: 320, carbs: 38, protein: 16, fat: 10, time: '40 min', goal: 'balanced', ingredients: ['Bell peppers', 'Quinoa', 'Black beans', 'Tomatoes', 'Corn', 'Cumin', 'Cheese'], steps: ['Cook quinoa with cumin.', 'Mix with beans, tomatoes, corn.', 'Hollow out peppers and fill.', 'Top with cheese.', 'Bake at 180C for 25 min.'] },
  { id: '30', icon: '🍝', name: 'Pasta Primavera', diet: 'Vegetarian', meal: 'Dinner', kcal: 440, carbs: 68, protein: 14, fat: 12, time: '25 min', goal: 'balanced', ingredients: ['Penne pasta', 'Cherry tomatoes', 'Zucchini', 'Asparagus', 'Olive oil', 'Parmesan', 'Basil'], steps: ['Cook pasta al dente.', 'Saute vegetables in olive oil.', 'Toss pasta with vegetables.', 'Add parmesan and fresh basil.'] },
  { id: '31', icon: '🍛', name: 'Thai Green Curry', diet: 'High Protein', meal: 'Dinner', kcal: 460, carbs: 38, protein: 36, fat: 18, time: '30 min', goal: 'muscle_gain', ingredients: ['Chicken breast', 'Green curry paste', 'Coconut milk', 'Bamboo shoots', 'Basil', 'Jasmine rice'], steps: ['Fry curry paste 1 min.', 'Add coconut milk and simmer.', 'Add chicken pieces and cook through.', 'Add bamboo shoots and basil.', 'Serve over jasmine rice.'] },
  { id: '32', icon: '🫘', name: 'Kidney Bean Chili', diet: 'Vegan', meal: 'Dinner', kcal: 350, carbs: 54, protein: 16, fat: 6, time: '35 min', goal: 'balanced', ingredients: ['Kidney beans', 'Chopped tomatoes', 'Onion', 'Chili powder', 'Cumin', 'Bell pepper', 'Cornbread'], steps: ['Saute onion and peppers.', 'Add spices and cook 1 min.', 'Add beans and tomatoes.', 'Simmer 25 min.', 'Serve with cornbread.'] },
  // Snacks
  { id: '33', icon: '🍏', name: 'Apple & Almond Butter', diet: 'Vegan', meal: 'Snack', kcal: 190, carbs: 26, protein: 4, fat: 10, time: '2 min', goal: 'balanced', ingredients: ['Apple', 'Almond butter'], steps: ['Slice apple.', 'Serve with 2 tbsp almond butter for dipping.'] },
  { id: '34', icon: '🥜', name: 'Trail Mix', diet: 'Vegan', meal: 'Snack', kcal: 210, carbs: 18, protein: 6, fat: 14, time: '1 min', goal: 'muscle_gain', ingredients: ['Mixed nuts', 'Dried cranberries', 'Dark chocolate chips', 'Pumpkin seeds'], steps: ['Mix all ingredients together.', 'Store in a container.'] },
  { id: '35', icon: '🧀', name: 'Cottage Cheese & Berries', diet: 'Vegetarian', meal: 'Snack', kcal: 160, carbs: 16, protein: 18, fat: 3, time: '2 min', goal: 'weight_loss', ingredients: ['Cottage cheese', 'Mixed berries', 'Honey'], steps: ['Spoon cottage cheese into a bowl.', 'Top with berries and a drizzle of honey.'] },
  { id: '36', icon: '🥒', name: 'Hummus & Veggies', diet: 'Vegan', meal: 'Snack', kcal: 140, carbs: 16, protein: 6, fat: 7, time: '5 min', goal: 'weight_loss', ingredients: ['Hummus', 'Cucumber', 'Carrot sticks', 'Bell pepper strips', 'Celery'], steps: ['Cut vegetables into sticks.', 'Serve with hummus for dipping.'] },
  { id: '37', icon: '🍫', name: 'Protein Energy Balls', diet: 'Vegetarian', meal: 'Snack', kcal: 180, carbs: 22, protein: 8, fat: 7, time: '15 min', goal: 'muscle_gain', ingredients: ['Oats', 'Peanut butter', 'Honey', 'Protein powder', 'Dark chocolate chips'], steps: ['Mix all ingredients together.', 'Roll into balls.', 'Refrigerate for 30 min to firm up.'] },
  { id: '38', icon: '🫐', name: 'Blueberry Chia Pudding', diet: 'Vegan', meal: 'Snack', kcal: 200, carbs: 28, protein: 6, fat: 8, time: '5 min', goal: 'balanced', ingredients: ['Chia seeds', 'Almond milk', 'Blueberries', 'Maple syrup', 'Vanilla extract'], steps: ['Mix chia seeds with almond milk.', 'Add maple syrup and vanilla.', 'Refrigerate overnight.', 'Top with blueberries.'] },
  // High Protein extras
  { id: '39', icon: '🥩', name: 'Steak & Roasted Veg', diet: 'High Protein', meal: 'Dinner', kcal: 520, carbs: 20, protein: 52, fat: 26, time: '30 min', goal: 'muscle_gain', ingredients: ['Sirloin steak', 'Sweet potato', 'Broccoli', 'Olive oil', 'Rosemary', 'Garlic'], steps: ['Roast sweet potato and broccoli at 200C.', 'Season steak and cook to desired doneness.', 'Rest steak 5 min before slicing.', 'Serve with roasted vegetables.'] },
  { id: '40', icon: '🐟', name: 'Tuna Stuffed Avocado', diet: 'Keto', meal: 'Lunch', kcal: 340, carbs: 8, protein: 28, fat: 22, time: '10 min', goal: 'weight_loss', ingredients: ['Canned tuna', 'Avocado', 'Lemon juice', 'Red onion', 'Celery', 'Dijon mustard'], steps: ['Mix tuna with lemon, onion, celery, mustard.', 'Halve avocado and remove pit.', 'Fill avocado halves with tuna mixture.'] },
  { id: '41', icon: '🍳', name: 'Shakshuka', diet: 'Vegetarian', meal: 'Breakfast', kcal: 290, carbs: 18, protein: 18, fat: 16, time: '25 min', goal: 'balanced', ingredients: ['Eggs', 'Canned tomatoes', 'Bell pepper', 'Onion', 'Cumin', 'Paprika', 'Feta'], steps: ['Saute onion and pepper.', 'Add spices and tomatoes, simmer 10 min.', 'Make wells and crack eggs in.', 'Cover and cook until whites set.', 'Top with feta.'] },
  { id: '42', icon: '🥗', name: 'Edamame Salad', diet: 'Vegan', meal: 'Lunch', kcal: 310, carbs: 28, protein: 18, fat: 14, time: '10 min', goal: 'balanced', ingredients: ['Edamame', 'Red cabbage', 'Mango', 'Cilantro', 'Sesame dressing', 'Sesame seeds'], steps: ['Cook edamame and cool.', 'Shred cabbage and cube mango.', 'Toss with cilantro and sesame dressing.', 'Top with sesame seeds.'] },
  { id: '43', icon: '🍗', name: 'Chicken Shawarma Bowl', diet: 'High Protein', meal: 'Dinner', kcal: 490, carbs: 42, protein: 48, fat: 14, time: '35 min', goal: 'muscle_gain', ingredients: ['Chicken thighs', 'Cumin', 'Turmeric', 'Paprika', 'Pita', 'Tahini', 'Tomato', 'Parsley'], steps: ['Marinate chicken with spices overnight.', 'Grill or pan cook chicken.', 'Slice and serve in bowl with pita.', 'Drizzle tahini and add tomato and parsley.'] },
  { id: '44', icon: '🫙', name: 'White Bean Soup', diet: 'Vegan', meal: 'Dinner', kcal: 290, carbs: 44, protein: 14, fat: 6, time: '30 min', goal: 'balanced', ingredients: ['White beans', 'Kale', 'Carrots', 'Celery', 'Garlic', 'Vegetable broth', 'Rosemary'], steps: ['Saute carrots, celery, garlic.', 'Add beans, broth, rosemary.', 'Simmer 20 min.', 'Add kale and cook 5 min more.'] },
  { id: '45', icon: '🥑', name: 'Keto Avocado Salad', diet: 'Keto', meal: 'Lunch', kcal: 360, carbs: 10, protein: 14, fat: 30, time: '10 min', goal: 'weight_loss', ingredients: ['Avocado', 'Cherry tomatoes', 'Cucumber', 'Feta', 'Olive oil', 'Lemon', 'Basil'], steps: ['Cube avocado and combine with tomatoes.', 'Add cucumber and feta.', 'Dress with olive oil and lemon.', 'Top with fresh basil.'] },
  { id: '46', icon: '🐚', name: 'Shrimp Tacos', diet: 'High Protein', meal: 'Dinner', kcal: 400, carbs: 36, protein: 38, fat: 12, time: '20 min', goal: 'muscle_gain', ingredients: ['Shrimp', 'Corn tortillas', 'Cabbage slaw', 'Lime', 'Cilantro', 'Sriracha mayo'], steps: ['Season and saute shrimp 2 min each side.', 'Warm tortillas.', 'Fill with shrimp and cabbage slaw.', 'Drizzle with sriracha mayo and lime juice.'] },
  { id: '47', icon: '🫑', name: 'Stuffed Zucchini Boats', diet: 'Low Carb', meal: 'Dinner', kcal: 310, carbs: 14, protein: 28, fat: 16, time: '35 min', goal: 'weight_loss', ingredients: ['Zucchini', 'Ground beef', 'Tomato sauce', 'Mozzarella', 'Onion', 'Garlic'], steps: ['Halve zucchini and scoop centers.', 'Brown beef with onion and garlic.', 'Add tomato sauce and fill zucchini.', 'Top with mozzarella.', 'Bake at 190C for 20 min.'] },
  { id: '48', icon: '🥘', name: 'Paella de Verduras', diet: 'Vegan', meal: 'Dinner', kcal: 410, carbs: 72, protein: 10, fat: 8, time: '40 min', goal: 'balanced', ingredients: ['Bomba rice', 'Bell peppers', 'Artichokes', 'Tomatoes', 'Saffron', 'Smoked paprika', 'Vegetable broth'], steps: ['Fry peppers and tomatoes in wide pan.', 'Add rice and spices, stir.', 'Pour broth over and simmer until absorbed (no stirring).', 'Let rest 5 min before serving.'] },
  { id: '49', icon: '🥗', name: 'Spinach Lentil Salad', diet: 'Vegan', meal: 'Lunch', kcal: 340, carbs: 44, protein: 18, fat: 10, time: '20 min', goal: 'balanced', ingredients: ['Green lentils', 'Spinach', 'Red onion', 'Cherry tomatoes', 'Lemon', 'Olive oil', 'Cumin'], steps: ['Cook lentils until tender.', 'Cool slightly.', 'Toss with spinach, tomatoes, red onion.', 'Dress with lemon, olive oil, cumin.'] },
  { id: '50', icon: '🍣', name: 'Sushi Bowl', diet: 'High Protein', meal: 'Dinner', kcal: 470, carbs: 58, protein: 34, fat: 10, time: '20 min', goal: 'balanced', ingredients: ['Sushi rice', 'Salmon', 'Avocado', 'Cucumber', 'Soy sauce', 'Rice vinegar', 'Sesame seeds', 'Nori'], steps: ['Cook sushi rice with rice vinegar.', 'Slice salmon.', 'Assemble bowl with rice, salmon, avocado, cucumber.', 'Drizzle soy sauce and add sesame seeds.', 'Shred nori on top.'] },
  { id: '51', icon: '🫛', name: 'Edamame & Brown Rice', diet: 'Vegan', meal: 'Lunch', kcal: 330, carbs: 54, protein: 14, fat: 6, time: '20 min', goal: 'balanced', ingredients: ['Brown rice', 'Edamame', 'Soy sauce', 'Sesame oil', 'Green onion', 'Ginger'], steps: ['Cook brown rice.', 'Steam edamame.', 'Mix rice with soy sauce, sesame oil, ginger.', 'Top with edamame and green onion.'] },
  { id: '52', icon: '🍔', name: 'Turkey Burger (No Bun)', diet: 'Low Carb', meal: 'Dinner', kcal: 380, carbs: 8, protein: 44, fat: 18, time: '20 min', goal: 'weight_loss', ingredients: ['Ground turkey', 'Lettuce wrap', 'Tomato', 'Onion', 'Mustard', 'Avocado'], steps: ['Season turkey and form into patty.', 'Cook in pan 5 min each side.', 'Serve in lettuce wrap with toppings.'] },
  { id: '53', icon: '🥦', name: 'Broccoli Cheddar Frittata', diet: 'Keto', meal: 'Breakfast', kcal: 300, carbs: 4, protein: 24, fat: 22, time: '20 min', goal: 'weight_loss', ingredients: ['Eggs', 'Broccoli florets', 'Cheddar cheese', 'Cream', 'Onion', 'Salt', 'Pepper'], steps: ['Blanch broccoli.', 'Saute onion, add broccoli.', 'Pour whisked eggs and cream over.', 'Top with cheddar.', 'Bake at 180C for 15 min.'] },
  { id: '54', icon: '🧆', name: 'Cauliflower Rice Bowl', diet: 'Keto', meal: 'Lunch', kcal: 290, carbs: 12, protein: 20, fat: 18, time: '15 min', goal: 'weight_loss', ingredients: ['Cauliflower', 'Ground beef', 'Onion', 'Garlic', 'Soy sauce', 'Sesame oil', 'Green onion'], steps: ['Pulse cauliflower into rice-sized pieces.', 'Fry beef with onion and garlic.', 'Add cauliflower rice and stir fry.', 'Season with soy sauce and sesame oil.'] },
  { id: '55', icon: '🥝', name: 'Green Detox Smoothie', diet: 'Vegan', meal: 'Breakfast', kcal: 220, carbs: 42, protein: 6, fat: 4, time: '5 min', goal: 'weight_loss', ingredients: ['Spinach', 'Kiwi', 'Apple', 'Cucumber', 'Lemon', 'Ginger', 'Water'], steps: ['Add all ingredients to blender.', 'Blend until smooth.', 'Add more water for desired consistency.', 'Serve immediately.'] },
  { id: '56', icon: '🍠', name: 'Sweet Potato Hash', diet: 'Vegetarian', meal: 'Breakfast', kcal: 330, carbs: 50, protein: 10, fat: 10, time: '20 min', goal: 'balanced', ingredients: ['Sweet potato', 'Eggs', 'Bell pepper', 'Onion', 'Smoked paprika', 'Olive oil'], steps: ['Dice and cook sweet potato until tender.', 'Add onion and peppers.', 'Make wells and add eggs.', 'Cover and cook until eggs set.'] },
  { id: '57', icon: '🍤', name: 'Garlic Butter Shrimp', diet: 'High Protein', meal: 'Dinner', kcal: 320, carbs: 4, protein: 42, fat: 14, time: '15 min', goal: 'weight_loss', ingredients: ['Shrimp', 'Butter', 'Garlic', 'Lemon', 'Parsley', 'Red pepper flakes'], steps: ['Melt butter in pan over high heat.', 'Add garlic and pepper flakes.', 'Add shrimp and cook 1-2 min per side.', 'Squeeze lemon and add parsley.'] },
  { id: '58', icon: '🫕', name: 'Veggie Soup', diet: 'Vegan', meal: 'Lunch', kcal: 180, carbs: 30, protein: 6, fat: 4, time: '30 min', goal: 'weight_loss', ingredients: ['Vegetable broth', 'Carrots', 'Celery', 'Zucchini', 'Tomatoes', 'Onion', 'Thyme', 'Bay leaf'], steps: ['Saute onion, carrots, celery.', 'Add broth, tomatoes, zucchini.', 'Add thyme and bay leaf.', 'Simmer 20 min.'] },
  { id: '59', icon: '🥗', name: 'Watermelon Feta Salad', diet: 'Vegetarian', meal: 'Snack', kcal: 180, carbs: 22, protein: 6, fat: 8, time: '5 min', goal: 'balanced', ingredients: ['Watermelon', 'Feta cheese', 'Mint', 'Red onion', 'Lime', 'Black pepper'], steps: ['Cube watermelon.', 'Crumble feta over top.', 'Add thinly sliced red onion.', 'Squeeze lime and add mint leaves.'] },
  { id: '60', icon: '🥙', name: 'Mediterranean Plate', diet: 'Mediterranean', meal: 'Lunch', kcal: 450, carbs: 38, protein: 18, fat: 24, time: '10 min', goal: 'balanced', ingredients: ['Pita bread', 'Hummus', 'Tabbouleh', 'Olives', 'Dolmades', 'Cucumber', 'Feta'], steps: ['Warm pita bread.', 'Arrange hummus, tabbouleh, olives, and dolmades.', 'Add cucumber and feta.', 'Serve immediately.'] },
];

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
        <Text style={styles.recipeMacroTxt}>P {recipe.protein}g</Text>
        <Text style={styles.recipeMacroTxt}>C {recipe.carbs}g</Text>
        <Text style={styles.recipeMacroTxt}>F {recipe.fat}g</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function RecipesScreen() {
  const { entries, selectedDate, addFood } = useDiaryStore();
  const { setMessagesOpen, addXp, calorieGoal } = useAppStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [selected, setSelected] = useState<typeof RECIPES[0] | null>(null);

  const entry = entries[selectedDate];
  const totalKcal = (entry?.foods ?? []).reduce((s, f) => s + f.kcal, 0);
  const remaining = Math.max(0, calorieGoal - totalKcal);

  const filtered = RECIPES.filter((r) => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === 'All') return true;
    if (['Breakfast', 'Lunch', 'Dinner', 'Snack'].includes(filter)) return r.meal === filter;
    return r.diet === filter;
  });

  // Goal-based section: recipes that fit remaining kcal budget
  const forGoal = RECIPES.filter(r => r.kcal <= remaining && remaining > 0).slice(0, 4);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.appHeader}>
          <Text style={styles.heading}>Recipes</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <TouchableOpacity style={styles.profileBtn} onPress={() => setMessagesOpen(true)}>
              <Ionicons name="notifications-outline" size={22} color={colors.ink2} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/(tabs)/profile')} style={styles.profileBtn}>
              <Ionicons name="person-outline" size={22} color={colors.ink2} />
            </TouchableOpacity>
          </View>
        </View>

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

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={16} color={colors.ink3} style={styles.searchIcon} />
          <TextInput
            style={styles.search}
            placeholder="Search recipes..."
            placeholderTextColor={colors.ink3}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={colors.ink3} />
            </TouchableOpacity>
          )}
        </View>

        {/* Diet filters */}
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

        {/* For your goal section */}
        {filter === 'All' && !search && forGoal.length > 0 && (
          <>
            <Text style={styles.sectionHdr}>For your goal</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md }}>
              {forGoal.map((r) => (
                <TouchableOpacity key={r.id} style={styles.goalCard} onPress={() => setSelected(r)} activeOpacity={0.8}>
                  <Text style={{ fontSize: 32 }}>{r.icon}</Text>
                  <Text style={styles.goalCardName}>{r.name}</Text>
                  <Text style={styles.goalCardKcal}>{r.kcal} kcal</Text>
                  <Text style={[styles.goalCardFits, { color: colors.green }]}>✓ Fits budget</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* Recipe grid */}
        <Text style={styles.sectionHdr}>{filter === 'All' && !search ? 'All Recipes' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}</Text>
        <View style={styles.grid}>
          {filtered.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} onPress={() => setSelected(recipe)} />
          ))}
          {filtered.length === 0 && (
            <View style={{ width: '100%', alignItems: 'center', paddingVertical: 40 }}>
              <Text style={{ fontSize: 40 }}>🔍</Text>
              <Text style={{ color: colors.ink3, marginTop: 12, fontSize: fontSize.sm }}>No recipes found</Text>
            </View>
          )}
        </View>
      </ScrollView>

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
                  <View style={styles.ingredientDot} />
                  <Text style={styles.ingredientTxt}>{ing}</Text>
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

  appHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profileBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
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
  recipeMacroTxt: { fontSize: 10, color: colors.ink3 },

  // Modal
  modal: { flex: 1, backgroundColor: colors.bg2 },
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
  ingredientDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.purple },
  ingredientTxt: { color: colors.ink2, fontSize: fontSize.sm },
  stepRow: { flexDirection: 'row', gap: 12, paddingVertical: 4 },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.purple + '33', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  stepNumTxt: { fontSize: 12, fontWeight: '700', color: colors.lavender },
  stepTxt: { flex: 1, color: colors.ink2, fontSize: fontSize.sm, lineHeight: 20 },
  logBtn: { backgroundColor: colors.purple, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.md },
  logBtnTxt: { color: '#fff', fontWeight: '700', fontSize: fontSize.base },
});

// Stack route pushed on top of the tabs when Recipes is opened from the
// Programs grid tile. Renders the shared RecipesScreen with a back button
// (entry="programs"). Kept separate from the bottom-tab Recipes route so the
// two entry points never share navigation state.
import { RecipesScreen } from './(tabs)/recipes';

export default function RecipesFromPrograms() {
  return <RecipesScreen source="programs" />;
}

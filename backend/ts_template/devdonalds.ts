import express, { Request, Response } from "express";

// ==== Type Definitions, feel free to add or modify ==========================
interface cookbookEntry {
  name: string;
  type: string;
}

interface requiredItem {
  name: string;
  quantity: number;
}

interface recipe extends cookbookEntry {
  requiredItems: requiredItem[];
}

interface ingredient extends cookbookEntry {
  cookTime: number;
}

// =============================================================================
// ==== HTTP Endpoint Stubs ====================================================
// =============================================================================
const app = express();
app.use(express.json());

// Store your recipes here!
const cookbook: any = null;
let inMemoryCookbook: (recipe | ingredient)[] = [];

// Task 1 helper (don't touch)
app.post("/parse", (req:Request, res:Response) => {
  const { input } = req.body;

  const parsed_string = parse_handwriting(input)
  if (parsed_string == null) {
    res.status(400).send("this string is cooked");
    return;
  }
  res.json({ msg: parsed_string });
  return;

});

// [TASK 1] ====================================================================
// Takes in a recipeName and returns it in a form that
const parse_handwriting = (recipeName: string): string | null => {
  // Check that recipeName is not empty and not whitespace only
  if (!recipeName.trim()) return null;

  // Replace - and _ with spaces
  let result = recipeName.replace(/[-_]/g, ' ');

  // Remove all characters that are not letters and not spaces
  result = result.replace(/[^A-Za-z\s]/g, '');

  // Trim leading/trailing whitespace and squash multiple spaces into one space
  result = result.trim().replace(/\s+/g, ' ');

  // Check if string is empty
  if (!result) {
    return null;
  }

  // Ensure first letter of each word is capitalised and the rest of each word is lowercased
  result = result
    .split(' ')
    .map(word => {
      const firstChar = word.charAt(0).toUpperCase();
      const rest = word.slice(1).toLowerCase();
      return firstChar + rest;
    })
    .join(' ');

  // If final string is empty, return null, otherwise return recipeName
  return result.length > 0 ? result : null;
}

// [TASK 2] ====================================================================
// Endpoint that adds a CookbookEntry to your magical cookbook
app.post("/entry", (req: Request, res: Response) => {
  const entry = req.body as Partial<recipe & ingredient>;

  // Check that type is either recipe or ingredient
  if (entry.type !== "recipe" && entry.type !== "ingredient") {
    return res.status(400).send();
  }

  // Check that name is valid string and unique
  if (!entry.name || typeof entry.name !== "string") {
    return res.status(400).send();
  }
  const nameExists = inMemoryCookbook.some((c) => c.name === entry.name);
  if (nameExists) {
    return res.status(400).send();
  }

  // If type is ingredient, validate cookTime
  if (entry.type === "ingredient") {
    if (typeof entry.cookTime !== "number" || entry.cookTime < 0) {
      return res.status(400).send();
    }

    // Valid to add inMemoryCookbook
    inMemoryCookbook.push({
      name: entry.name,
      type: "ingredient",
      cookTime: entry.cookTime,
    } as ingredient);

    return res.status(200).send();
  }

  // If type is recipe, validate requiredItems
  if (entry.type === "recipe") {
    if (!Array.isArray(entry.requiredItems)) {
      return res.status(400).send();
    }

    // Ensure no duplicate names in requiredItems
    const itemNames = entry.requiredItems.map((item) => item.name);
    if (new Set(itemNames).size !== itemNames.length) {
      return res.status(400).send();
    }

    // Validate each requiredItem's structure
    for (const item of entry.requiredItems) {
      if (
        !item ||
        typeof item.name !== "string" ||
        typeof item.quantity !== "number" ||
        item.quantity < 1
      ) {
        return res.status(400).send();
      }
    }

    // Valid to add inMemoryCookbook
    inMemoryCookbook.push({
      name: entry.name,
      type: "recipe",
      requiredItems: entry.requiredItems,
    } as recipe);

    return res.status(200).send();
  }

  return res.status(400).send();
});

// [TASK 3] ====================================================================
// Endpoint that returns a summary of a recipe that corresponds to a query name
app.get("/summary", (req: Request, res: Response) => {
  const { name } = req.query;

  // Validate query parameter
  if (!name || typeof name !== "string") {
    return res.status(400).send();
  }

  // Find recipe inMemoryCookbook
  const entry = inMemoryCookbook.find(e => e.name === name);

  // Check if not found or if not recipe
  if (!entry || entry.type !== "recipe") {
    return res.status(400).send();
  }

  try {
    const { totalCookTime, aggregatedIngredients } = gatherRecipeData(entry as recipe);

    // Convert ingredient map to array { name, quantity }
    const ingredientsArray = Object.entries(aggregatedIngredients).map(
      ([iName, qty]) => ({ name: iName, quantity: qty })
    );

    // Return summary
    return res.json({
      name: entry.name,
      cookTime: totalCookTime,
      ingredients: ingredientsArray,
    });
  } catch (error) {
    // Check if required item is missing
    return res.status(400).send();
  }
});

/**
 * Recursively gathers total cookTime and merged list of base ingredients
 *
 * @param rec A top-level recipe (or sub-recipe) from inMemoryCookbook
 * @param multiplier Used when a recipe is required multiple times
 * @param aggregated A map of ingredientName -> total quantity
 * @returns { totalCookTime, aggregatedIngredients }
 */
function gatherRecipeData(
  rec: recipe,
  multiplier = 1,
  aggregated: Record<string, number> = {}
): { totalCookTime: number; aggregatedIngredients: Record<string, number> } {
  let totalCookTime = 0;

  for (const reqItem of rec.requiredItems) {
    const neededQty = reqItem.quantity * multiplier;

    // Find required item inMemoryCookbook
    const referenced = inMemoryCookbook.find(e => e.name === reqItem.name);
    if (!referenced) {
      // Check if missing required item
      throw new Error(`Missing item "${reqItem.name}"`);
    }

    // Check if base ingredient
    if (referenced.type === "ingredient") {
      const ing = referenced as ingredient;
      totalCookTime += ing.cookTime * neededQty;
      aggregated[ing.name] = (aggregated[ing.name] || 0) + neededQty;

    } else if (referenced.type === "recipe") {
      // Recursively process sub-recipe
      const subRecipe = referenced as recipe;
      const subResult = gatherRecipeData(subRecipe, neededQty, aggregated);
      totalCookTime += subResult.totalCookTime;

    } else {
      // Invalid or unknown type
      throw new Error(`Invalid type "${referenced.type}" for "${referenced.name}"`);
    }
  }

  return { totalCookTime, aggregatedIngredients: aggregated };
}

// =============================================================================
// ==== DO NOT TOUCH ===========================================================
// =============================================================================
const port = 8080;
app.listen(port, () => {
  console.log(`Running on: http://127.0.0.1:8080`);
});

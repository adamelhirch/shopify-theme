# Recipe Photo Prompts

Ces prompts servent a generer un premier lot de visuels recette coherents avec l'univers Vanille Desire, sans reutiliser les photos produit.

Direction commune :
- photo culinaire editoriale premium
- lumiere naturelle douce, haut de gamme, jamais publicitaire agressive
- textures lisibles, nourriture reelle, dressing simple
- fond sobre, tons creme, sable, bois clair, pierre douce
- aucune main si non necessaire
- aucun packaging, aucun pot, aucun flacon, aucun produit retail visible
- aucune typographie, aucun watermark, aucun logo

Prompt socle :

```text
Use case: product-photo
Asset type: recipe card and recipe hero image
Primary request: premium editorial food photography for the Vanille Desire recipe directory
Style/medium: photorealistic food photography
Composition/framing: hero crop friendly for website cards and wide recipe headers, elegant negative space, plated dish as the clear focal point
Lighting/mood: soft natural window light, refined shadows, high-end culinary editorial
Color palette: warm cream, vanilla beige, toasted gold, muted botanical greens when relevant
Materials/textures: ceramic plates, brushed linen, light wood, stone, realistic food textures
Constraints: no product packaging, no jars, no branded objects, no text, no watermark, no collage
Avoid: stock-photo vibe, oversaturated food styling, artificial garnish overload, plastic shine, messy backgrounds
```

## beignet-banane

```text
Primary request: a plate of freshly fried banana fritters with visible vanilla bean specks, crisp golden exterior, soft interior suggested by one opened fritter
Scene/background: refined breakfast table, light stone surface, folded linen, subtle warm tropical atmosphere
Subject: banana fritters with Madagascar vanilla
Composition/framing: three-quarter angle, plated hero shot, elegant empty space around the plate
Lighting/mood: soft morning light, indulgent but clean
```

## riz-lait-tonka-vanille

```text
Primary request: a generous bowl of creamy rice pudding with visible vanilla seeds and a delicate tonka finish
Scene/background: ceramic bowl on pale stone, spoon nearby, linen texture, restrained styling
Subject: creamy rice pudding, glossy and comforting
Composition/framing: close editorial crop, slight overhead angle
Lighting/mood: calm natural light, soft and luxurious
```

## creme-brulee-vanille-bourbon

```text
Primary request: a creme brulee with a finely torched caramel top, one spoon breaking the surface, vanilla bean detail visible in the custard
Scene/background: clean restaurant-style plating, warm cream palette, minimal props
Subject: vanilla creme brulee
Composition/framing: close-up hero shot with sharp texture on the caramel crust
Lighting/mood: intimate warm light, elegant dessert editorial
```

## cake-vanille-cannelle-madagascar

```text
Primary request: slices of vanilla and cinnamon cake, moist crumb, subtle glaze, visible vanilla flecks
Scene/background: rustic but premium tea-time setting, wood and linen, minimal styling
Subject: vanilla cinnamon loaf cake
Composition/framing: angled tabletop shot, whole loaf plus one sliced piece
Lighting/mood: afternoon natural light, comforting and premium
```

## ananas-roti-vanille-poivre-sauvage

```text
Primary request: roasted pineapple segments with vanilla glaze and a light dusting of wild pepper, glossy caramelized edges
Scene/background: pale ceramic plate, tropical restraint, no exotic overload
Subject: roasted pineapple dessert
Composition/framing: plated dessert shot, slightly elevated angle, refined empty space
Lighting/mood: warm sunset-style light, precise and sophisticated
```

## carottes-roties-vanille-combava

```text
Primary request: roasted carrots with subtle glaze, citrus freshness and vanilla precision, savory fine-dining presentation
Scene/background: muted stone plate, modern savory editorial setup
Subject: roasted carrots in an elevated savory plating
Composition/framing: close tabletop crop, elegant asymmetry
Lighting/mood: natural directional light, refined and modern
```

## crevettes-curry-vanille

```text
Primary request: sauteed shrimp in a silky curry and vanilla sauce, plated with precision, sauce texture clearly visible
Scene/background: shallow ceramic plate, restrained savory styling, premium restaurant feel
Subject: shrimp in curry vanilla sauce
Composition/framing: three-quarter plated shot, focus on sauce and shrimp texture
Lighting/mood: warm editorial light, savory and upscale
```

## accords-vanille-salee

```text
Primary request: a refined savory tasting composition showing vanilla pairing ideas with fish, butter sauce and vegetables, editorial still life rather than a product shot
Scene/background: chef test kitchen mood, clean stone surface, subtle ingredients, no packaging
Subject: savory vanilla pairing board
Composition/framing: wide still-life shot with elegant spacing between components
Lighting/mood: precise natural light, educational but luxurious
```

Une fois `OPENAI_API_KEY` disponible, je pourrai lancer un batch propre recette par recette avec le skill `imagegen`, en reprenant le prompt socle puis la section cible correspondante.

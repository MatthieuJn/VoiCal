import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY })

export const GEMINI_MODEL = 'gemini-2.5-flash'

export function computeTotals(ingredients) {
  return ingredients.reduce((acc, ing) => {
    const f = (ing.quantity_g || 0) / 100
    return {
      calories: acc.calories + (ing.kcal_per_100g      || 0) * f,
      proteins: acc.proteins + (ing.proteins_per_100g  || 0) * f,
      carbs:    acc.carbs    + (ing.carbs_per_100g     || 0) * f,
      fats:     acc.fats     + (ing.fats_per_100g      || 0) * f,
      fibers:   acc.fibers   + (ing.fibers_per_100g    || 0) * f,
    }
  }, { calories: 0, proteins: 0, carbs: 0, fats: 0, fibers: 0 })
}

const INGREDIENT_SCHEMA = `{
  "name": "<nom de l'aliment>",
  "quantity_g": <grammes estimés, nombre entier>,
  "kcal_per_100g": <nombre décimal>,
  "proteins_per_100g": <nombre décimal>,
  "carbs_per_100g": <nombre décimal>,
  "fats_per_100g": <nombre décimal>,
  "fibers_per_100g": <nombre décimal>
}`

export async function analyzeMeal(text) {
  const prompt = `Tu es un expert en nutrition. L'utilisateur décrit un repas en français de manière informelle.
Pour chaque aliment identifié, estime la quantité consommée et les valeurs nutritionnelles standard aux 100g.
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans texte autour :
{
  "name": "<résumé court du repas, 3-5 mots>",
  "ingredients": [${INGREDIENT_SCHEMA}]
}

Repas : "${text}"`

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
  })

  const raw = response.text
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Réponse invalide de Gemini')
  const parsed = JSON.parse(jsonMatch[0])
  return { ...parsed, totals: computeTotals(parsed.ingredients) }
}

export async function analyzeMealFromPhoto(imageBase64, mimeType, textContext = '') {
  const contextLine = textContext ? `\nContexte supplémentaire : "${textContext}"` : ''
  const prompt = `Tu es un expert en nutrition. Analyse cette photo de repas.
Pour chaque aliment visible, estime la quantité et les valeurs nutritionnelles standard aux 100g.${contextLine}
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown :
{
  "name": "<résumé court du repas, 3-5 mots>",
  "ingredients": [${INGREDIENT_SCHEMA}]
}`

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: imageBase64 } },
        ],
      },
    ],
  })

  const raw = response.text
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Réponse invalide de Gemini')
  const parsed = JSON.parse(jsonMatch[0])
  return { ...parsed, totals: computeTotals(parsed.ingredients) }
}

export async function recalculateMeal(ingredients, originalText) {
  const list = ingredients.map(ing =>
    `- ${ing.name} : ${ing.quantity_g}g | ${ing.kcal_per_100g} kcal/100g | P:${ing.proteins_per_100g} G:${ing.carbs_per_100g} L:${ing.fats_per_100g} F:${ing.fibers_per_100g} (g/100g)`
  ).join('\n')

  const prompt = `Tu es un expert en nutrition. L'utilisateur a modifié certaines valeurs nutritionnelles d'un repas.
Corrige et complète les valeurs incohérentes si nécessaire, puis retourne le JSON complet.
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown :
{
  "name": "<résumé court>",
  "ingredients": [${INGREDIENT_SCHEMA}]
}

Repas original : "${originalText}"

Valeurs actuelles (certaines ont été modifiées par l'utilisateur) :
${list}`

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
  })

  const raw = response.text
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Réponse invalide de Gemini')
  const parsed = JSON.parse(jsonMatch[0])
  return { ...parsed, totals: computeTotals(parsed.ingredients) }
}

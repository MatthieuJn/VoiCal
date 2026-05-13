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

export async function analyzeActivity(description, weightKg, ageYears, heightCm, imageBase64 = null, mimeType = null) {
  const weightLine = weightKg ? `- Poids : ${weightKg} kg` : `- Poids : inconnu (utilise 80 kg par défaut)`
  const photoLine = imageBase64 ? '\nUne photo de la séance ou du contexte sportif est jointe.' : ''
  const descLine = description ? `\nDescription : "${description}"` : ''
  const prompt = `Tu es un expert en physiologie sportive. L'utilisateur décrit une séance sportive.${photoLine}
Données physiques :
${weightLine}
- Âge : ${ageYears} ans
- Taille : ${heightCm} cm

Calcule les calories NETTES brûlées, c'est-à-dire :
  calories nettes = calories brûlées pendant l'activité − calories brûlées en étant assis au bureau pendant la même durée
(car ces calories auraient été brûlées de toute façon au repos)

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown :
{
  "name": "<nom court de l'activité, 2-4 mots>",
  "gross_calories": <nombre entier, calories brutes de l'activité>,
  "rest_calories": <nombre entier, calories au repos sur la même durée>,
  "net_calories": <nombre entier, gross − rest>,
  "duration_min": <durée estimée en minutes>,
  "met": <valeur MET utilisée, nombre décimal>,
  "notes": "<explication courte : ex. 'MET 6.0 × 80kg × 0.75h = 360 kcal brut − 65 kcal repos = 295 kcal net'>"
}
${descLine}`

  const contents = imageBase64
    ? [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data: imageBase64 } }] }]
    : prompt

  const response = await ai.models.generateContent({ model: GEMINI_MODEL, contents })

  const raw = response.text
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Réponse invalide de Gemini')
  return JSON.parse(jsonMatch[0])
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

import { supabase } from './supabase'

export const GEMINI_MODEL = 'gemini-2.5-flash'

// Les appels passent par /api/gemini (serveur Vercel) : la clé n'est plus dans le navigateur.
async function generate(contents) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ contents }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur serveur (${res.status})`)
  return data.text
}

// Même interface que l'ancien SDK, pour ne pas toucher au reste du fichier.
const ai = {
  models: {
    generateContent: async ({ contents }) => ({ text: await generate(await normalizeAsync(contents)) }),
  },
}

// Accepte un texte simple ou un tableau de messages, comme le SDK. Réduit les photos
// (le serveur Vercel refuse les requêtes de plus de 4,5 Mo).
async function normalizeAsync(contents) {
  if (typeof contents === 'string') return [{ role: 'user', parts: [{ text: contents }] }]
  return Promise.all(contents.map(async msg => ({
    ...msg,
    parts: await Promise.all(msg.parts.map(async p =>
      p.inlineData ? { inlineData: await shrinkImage(p.inlineData) } : p)),
  })))
}

function shrinkImage({ mimeType, data }, maxSide = 1280) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve({ mimeType: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.85).split(',')[1] })
    }
    img.onerror = () => resolve({ mimeType, data })
    img.src = `data:${mimeType};base64,${data}`
  })
}

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

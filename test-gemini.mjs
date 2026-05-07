import { GoogleGenAI } from '@google/genai'

const apiKey = process.env.VITE_GEMINI_API_KEY
if (!apiKey) { console.error('Clé manquante'); process.exit(1) }

const ai = new GoogleGenAI({ apiKey })

const prompt = `Repas : 200g de poulet grillé, 150g de riz basmati, une salade verte.
Réponds UNIQUEMENT avec un JSON :
{"name":"...","calories":0,"proteins":0,"carbs":0,"fats":0,"fibers":0}`

console.log('Appel Gemini...')
const response = await ai.models.generateContent({
  model: 'gemini-2.0-flash-lite',
  contents: prompt,
})
console.log('Réponse :', response.text)

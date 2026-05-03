function extractNum(text, re) {
  const m = text.match(re)
  return m ? parseFloat(m[1]) : 0
}

export function parseMealInput(raw) {
  const text = raw.trim()

  // Cherche la section "Total du repas" en premier
  const totalIdx = text.search(/##\s*.*total/i)
  if (totalIdx !== -1) {
    const section = text.slice(totalIdx)
    const result = {
      calories: extractNum(section, /calories[^\d\n]*(\d+(?:\.\d+)?)/i),
      proteins: extractNum(section, /prot[ée]ines?[^\d\n]*(\d+(?:\.\d+)?)/i),
      carbs:    extractNum(section, /glucides?[^\d\n]*(\d+(?:\.\d+)?)/i),
      fats:     extractNum(section, /lipides?[^\d\n]*(\d+(?:\.\d+)?)/i),
      fibers:   extractNum(section, /fibres?[^\d\n]*(\d+(?:\.\d+)?)/i),
    }
    if (result.calories > 0) return result
  }

  // Fallback : additionne les items individuels (### Aliment)
  const blocks = [...text.matchAll(/###[^\n]+\n([\s\S]*?)(?=###|##|---|\s*$)/g)]
  const totals = { calories: 0, proteins: 0, carbs: 0, fats: 0, fibers: 0 }
  for (const [, block] of blocks) {
    totals.calories += extractNum(block, /calories[^\d\n]*(\d+(?:\.\d+)?)/i)
    totals.proteins += extractNum(block, /prot[ée]ines?[^\d\n]*(\d+(?:\.\d+)?)/i)
    totals.carbs    += extractNum(block, /glucides?[^\d\n]*(\d+(?:\.\d+)?)/i)
    totals.fats     += extractNum(block, /lipides?[^\d\n]*(\d+(?:\.\d+)?)/i)
    totals.fibers   += extractNum(block, /fibres?[^\d\n]*(\d+(?:\.\d+)?)/i)
  }
  return totals
}

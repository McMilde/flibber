// Enkelt filter mot stygge kallenavn på den offentlige topplisten.

const STYGGE_ORD = [
  // norsk
  'faen', 'fitte', 'fitta', 'kuk', 'kukk', 'pikk', 'pikken', 'hore', 'horer', 'jævla', 'jævel', 'jævlig',
  'helvete', 'satan', 'satans', 'ræva', 'rævhøl', 'rasshøl', 'drittsekk', 'idiot', 'mongo', 'neger', 'nigger',
  'pule', 'knull', 'knulle', 'ludder', 'hestkuk', 'faenskap', 'homse', 'soper', 'føkk', 'pakkis',
  'kåt', 'tissefant', 'pupper', 'mordi', 'mor di', 'sexy', 'porno', 'onani', 'runk', 'runke',
  // engelsk
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'whore', 'slut', 'nigga', 'fag', 'retard',
  'nazi', 'hitler', 'heil', 'sieg', 'kkk', 'porn', 'sex', 'penis', 'vagina', 'anal', 'rape', 'wank', 'twat',
  'asshole', 'bastard',
];

// Ord som er korte og lett gir falske treff: krever helt ord, ikke del av ord
const KUN_HELE_ORD = new Set(['hore', 'horer', 'runk', 'runke', 'pule', 'soper', 'mongo', 'kuk', 'kåt', 'fag', 'anal', 'sex', 'sieg', 'heil', 'dick', 'cock', 'idiot']);

function normaliser(tekst) {
  return tekst.toLowerCase()
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a')
    .replace(/5/g, 's').replace(/7/g, 't').replace(/\$/g, 's').replace(/@/g, 'a');
}

export function rensNavn(navn) {
  if (typeof navn !== 'string') return '';
  return navn
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
}

export function erStyggtNavn(navn) {
  const n = normaliser(navn);
  const sammenhengende = n.replace(/[^a-zæøå]/g, '');
  const ord = n.split(/[^a-zæøå]+/).filter(Boolean);
  return STYGGE_ORD.some(s => {
    const ss = s.replace(/\s/g, '');
    if (KUN_HELE_ORD.has(s)) return ord.includes(s);
    return sammenhengende.includes(ss);
  });
}

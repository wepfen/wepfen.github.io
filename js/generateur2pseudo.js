const prefixes = [
  "repousseur",
  "avoineur",
  "arracheur",
  "devoreur",
  "chevaucheur",
  "lécheur",
  "renifleur",
  "kidnappeur",
  "frappeur",
  "bouffeur",
  "démolisseur",
  "générateur",
  "delogeur",
  "traiteur",
  "guesseur",
  "hebergeur",
  "mangeur",
  "harceleur",
  "purificateur",
  "connaisseur",
  "kiffeur",
  "chercheur",
  "appliqueur",
  "fetichiste",
  "malaxeur"
];

const suffixes = [
  "baddie",
  "cochon",
  "pieds",
  "nain",
  "macaques",
  "hijab",
  "pdf",
  "paf",
  "civils",
  "mektoub",
  "slip",
  "LLM",
  "commercial",
  "marketeux",
  "khufar",
  "gothique",
  "challmaker",
  "milf",
  "tana"
];

function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function generateUsername() {
  const pre = getRandomItem(prefixes);
  const suf = getRandomItem(suffixes);
  const username = `${pre}2${suf}`;
  
  document.getElementById('username-display').textContent = username;
}

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('generate-btn').addEventListener('click', generateUsername);
  
});


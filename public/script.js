let CONFIG = {};
let radarrProfiles = [];
let sonarrProfiles = [];

let currentPageFilm = 1;
let currentPageSerie = 1;
let resultsPerPage = 6;
let searchResultsFilm = [];
let searchResultsSerie = [];

async function loadConfig() {
  try {
    let response = await fetch('/config');
    CONFIG = await response.json();
  } catch (error) {
    console.error("Erreur lors du chargement de la configuration:", error);
  }
}

async function loadQualityProfiles() {
  try {
    let radarrResponse = await fetch(`${CONFIG.radarr.baseURL}/api/v3/qualityProfile?apikey=${CONFIG.radarr.apiKey}`);
    radarrProfiles = await radarrResponse.json();

    let sonarrResponse = await fetch(`${CONFIG.sonarr.baseURL}/api/v3/qualityProfile?apikey=${CONFIG.sonarr.apiKey}`);
    sonarrProfiles = await sonarrResponse.json();
  } catch (error) {
    console.error("Erreur lors du chargement des profils de qualité:", error);
  }
}

async function adjustResultsPerPage() {
  let availableHeight = window.innerHeight - document.querySelector(".header-container").offsetHeight - 100; // Ajuste selon les marges
  let itemHeight = 200; // Estimation de la hauteur d'un élément (carte)
  let maxItems = Math.floor(availableHeight / itemHeight); // Nombre d'éléments visibles
  resultsPerPage = Math.max(2, maxItems); // Minimum 2 éléments affichés
}

async function searchContent() {
  let query = document.getElementById("searchQuery").value.trim(); // Supprime les espaces inutiles
  if (query.length < 3) { // Effacer les résultats si la recherche est trop courte
    localStorage.removeItem("searchQuery"); // Supprimer la recherche enregistrée
    clearResults(); // Effacer les résultats affichés
    return; // Arrêter la recherche
  }

  // Sauvegarde la recherche dans localStorage
  localStorage.setItem("searchQuery", query);

  // Afficher l'indicateur en haut à droite
  let loadingIndicator = document.getElementById("loadingIndicator");
  loadingIndicator.classList.remove("hidden");
  loadingIndicator.classList.add("visible");

  await adjustResultsPerPage();

  let filmApiUrl = `${CONFIG.radarr.baseURL}/api/v3/movie/lookup?term=${query}&apikey=${CONFIG.radarr.apiKey}&language=fr`;
  let serieApiUrl = `${CONFIG.sonarr.baseURL}/api/v3/series/lookup?term=${query}&apikey=${CONFIG.sonarr.apiKey}&language=fr`;

  try {
    let [filmResponse, serieResponse] = await Promise.all([
        fetch(filmApiUrl),
        fetch(serieApiUrl)
    ]);

    searchResultsFilm = await filmResponse.json();
    searchResultsSerie = await serieResponse.json();

    currentPageFilm = 1; // Réinitialiser la pagination
    currentPageSerie = 1;

    displayResults(searchResultsFilm, "filmResults", "filmPagination", currentPageFilm);
    displayResults(searchResultsSerie, "serieResults", "seriePagination", currentPageSerie);
  } catch (error) {
    console.error("Erreur lors de la recherche :", error);
  }

  // Masquer l'indicateur après la recherche
  setTimeout(() => {
    loadingIndicator.classList.add("hidden");
    loadingIndicator.classList.remove("visible");
  }, 500);
}

function displayResults(results, containerId, paginationId, currentPage) {
  let resultsDiv = document.getElementById(containerId);
  resultsDiv.innerHTML = "";

  if (results.length === 0) {
    resultsDiv.innerHTML = "<p>Aucun résultat trouvé.</p>";
    return;
  }

  let start = (currentPage - 1) * resultsPerPage;
  let end = start + resultsPerPage;
  let paginatedResults = results.slice(start, end);

  paginatedResults.forEach(item => {
    let isFilm = containerId === "filmResults";
    let poster = item.images?.find(img => img.coverType === "poster")?.remoteUrl || "https://placehold.co/100x150?text=No+Image";
    let id = isFilm ? item.tmdbId : item.tvdbId;
    let qualityOptions = (isFilm ? radarrProfiles : sonarrProfiles)
        .map(p => `<option value="${p.id}">${p.name}</option>`).join("");

    let addFunction = `addToLibrary('${id}', '${isFilm ? "film" : "serie"}')`;

    resultsDiv.innerHTML += `
      <div class='card'>
        <img src='${poster}' alt='Affiche'>
        <div class='info'>
          <h3>${isFilm ? "[Film]" : "[Série]"} ${item.title} (${item.year})</h3>
          <p>${truncateText(item.overview, 250)}</p>
          <select id="quality-${id}">${qualityOptions}</select>
          <button onclick="${addFunction}">Ajouter</button>
        </div>
      </div>`;
  });

  displayPaginationControls(results.length, paginationId, currentPage, containerId);
}

function displayPaginationControls(totalResults, paginationId, currentPage, containerId) {
  let paginationDiv = document.getElementById(paginationId);
  paginationDiv.innerHTML = "";

  if (totalResults <= resultsPerPage) return; // Pas besoin de pagination

  let totalPages = Math.ceil(totalResults / resultsPerPage);

  let prevButton = `<button onclick="changePage('${containerId}', -1)" ${currentPage === 1 ? "disabled" : ""}>⬅️ Précédent</button>`;
  let nextButton = `<button onclick="changePage('${containerId}', 1)" ${currentPage === totalPages ? "disabled" : ""}>Suivant ➡️</button>`;

  paginationDiv.innerHTML = `
    <div class="pagination-controls">
      ${prevButton}
      <span>Page ${currentPage} / ${totalPages}</span>
      ${nextButton}
    </div>
  `;
}

function changePage(containerId, direction) {
  if (containerId === "filmResults") {
    let totalPages = Math.ceil(searchResultsFilm.length / resultsPerPage);
    currentPageFilm += direction;
    if (currentPageFilm < 1) currentPageFilm = 1;
    if (currentPageFilm > totalPages) currentPageFilm = totalPages;
    displayResults(searchResultsFilm, "filmResults", "filmPagination", currentPageFilm);
  } else {
    let totalPages = Math.ceil(searchResultsSerie.length / resultsPerPage);
    currentPageSerie += direction;
    if (currentPageSerie < 1) currentPageSerie = 1;
    if (currentPageSerie > totalPages) currentPageSerie = totalPages;
    displayResults(searchResultsSerie, "serieResults", "seriePagination", currentPageSerie);
  }
}

function clearResults() {
  document.getElementById("filmResults").innerHTML = "";
  document.getElementById("serieResults").innerHTML = "";
  document.getElementById("filmPagination").innerHTML = "";
  document.getElementById("seriePagination").innerHTML = "";
}

async function addToLibrary(id, type) {
  let qualitySelect = document.getElementById(`quality-${id}`);

  if (!qualitySelect) {
    customAlert("Erreur : Impossible de récupérer le profil de qualité.", "error");
    console.error(`Élément non trouvé : quality-${id}`);
    return;
  }

  // Vérifier si c'est un film ou une série et utiliser le bon tableau
  let searchResults = type === "film" ? searchResultsFilm : searchResultsSerie;

  // Trouver l'élément correspondant dans `searchResults`
  let item = searchResults.find(el => (type === "film" ? el.tmdbId == id : el.tvdbId == id));
  if (!item) {
      customAlert("Erreur : Impossible de récupérer les informations du contenu.", "error");
      console.error("Élément introuvable dans searchResults", id);
      return;
  }

  let qualityProfileId = parseInt(qualitySelect.value);
  let apiUrl, data, apiKey;
  let itemTitle = item.title || "Titre inconnu"; // On s'assure que Title est toujours présent
  let itemYear = item.year || new Date().getFullYear(); // On met l'année actuelle si absente

  if (type === "film") {
    apiUrl = `${CONFIG.radarr.baseURL}/api/v3/movie`;
    apiKey = CONFIG.radarr.apiKey;
    data = {
      tmdbId: id,
      title: itemTitle, // Ajout du titre
      year: itemYear,
      qualityProfileId: qualityProfileId,
      rootFolderPath: "/movies",
      monitored: true
    };
  } else {
    apiUrl = `${CONFIG.sonarr.baseURL}/api/v3/series`;
    apiKey = CONFIG.sonarr.apiKey;
    data = {
      tvdbId: id,
      title: itemTitle, // Ajout du titre
      year: itemYear,
      qualityProfileId: qualityProfileId,
      rootFolderPath: "/tv",
      monitored: true
    };
  }

  // Afficher l'indicateur de chargement
  document.getElementById("loadingIndicator").classList.remove("hidden");

  let response = await fetch(apiUrl, {
    method: "POST",
    headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  // Cacher l'indicateur après la requête
  document.getElementById("loadingIndicator").classList.add("hidden");

  if (response.ok) {
    customAlert(`${type === "film" ? "Film" : "Série"} ajouté(e) avec succès !`, "success");

    // Lancer la recherche dans Radarr (pas nécessaire pour Sonarr)
    if (type === "film") {
      let movie = await response.json();
      await fetch(`${CONFIG.radarr.baseURL}/api/v3/command`, {
        method: "POST",
        headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "MoviesSearch", movieIds: [movie.id] })
      });
    }
  } else {
    customAlert("Erreur : " + await response.text(), "error");
  }
}

function truncateText(text, maxLength) {
  if (!text) return "Synopsis non disponible.";
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
}

function customAlert(message, type = 'info') {
    // Vérifier si une alerte existe déjà et la supprimer
    let existingAlert = document.querySelector('.custom-alert');
    if (existingAlert) {
        existingAlert.remove();
    }

    // Créer l'élément de l'alerte
    let alertBox = document.createElement('div');
    alertBox.classList.add('custom-alert', type);
    alertBox.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">&times;</button>
    `;

    // Ajouter l'alerte à la page
    document.body.appendChild(alertBox);

    // Supprimer automatiquement après quelques secondes
    setTimeout(() => {
        alertBox.remove();
    }, 5000);
}

// Ajouter du style avec CSS
document.head.insertAdjacentHTML('beforeend', `
    <style>
        .custom-alert {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #333;
            color: white;
            padding: 15px 20px;
            border-radius: 5px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            font-family: Arial, sans-serif;
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 1000;
            /*opacity: 0.9;*/
        }
        .custom-alert button {
            background: transparent;
            border: none;
            color: white;
            font-size: 20px;
            cursor: pointer;
        }
        .custom-alert.info { background: #2196F3; }
        .custom-alert.success { background: #4CAF50; }
        .custom-alert.warning { background: #FF9800; }
        .custom-alert.error { background: #F44336; }
    </style>
`);

async function init() {
  await loadConfig(); // Attendre que CONFIG soit chargé
  await loadQualityProfiles(); // Ensuite charger les profils de qualité

  // Charger la recherche stockée
  let savedQuery = localStorage.getItem("searchQuery");
  if (savedQuery && savedQuery.trim().length >= 3) { // Vérifie que la recherche fait au moins 3 caractères
    document.getElementById("searchQuery").value = savedQuery;

    // Afficher l'indicateur car une recherche est relancée après le refresh
    let loadingIndicator = document.getElementById("loadingIndicator");
    loadingIndicator.classList.remove("hidden");
    loadingIndicator.classList.add("visible");

    searchContent(); // Relancer directement la recherche
  } else {
    localStorage.removeItem("searchQuery"); // Nettoyer localStorage si la valeur est vide
    clearResults(); // Supprimer les résultats affichés
    adjustResultsPerPage(); // Seulement si aucune recherche n'est en cours
  }

  // Ajoute un écouteur pour recalculer le nombre d'entrées si la fenêtre est redimensionnée
  window.addEventListener("resize", adjustResultsPerPage);

  // Déclenche la recherche automatiquement après 3 caractères saisis
  document.getElementById("searchQuery").addEventListener("input", function() {
    if (this.value.length < 3) { // Vérifie si la recherche est trop courte
      localStorage.removeItem("searchQuery"); // Supprime la recherche stockée
      clearResults(); // Effacer les résultats affichés immédiatement
    } else {
      searchContent();
    }
  });
}

init();
